-- Enums
CREATE TYPE public.discipline AS ENUM ('engineering','design','business','data','research','other');
CREATE TYPE public.task_status AS ENUM ('backlog','in_progress','in_review','done');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text,
  avatar_url text,
  bio text,
  discipline public.discipline NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX messages_channel_created_idx ON public.messages (channel_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'backlog',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id uuid,
  due_date date,
  position double precision NOT NULL DEFAULT 1000,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx ON public.tasks (project_id, status, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX milestones_project_idx ON public.milestones (project_id, due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position double precision NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliverables_milestone_idx ON public.deliverables (milestone_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliverables TO authenticated;
GRANT ALL ON public.deliverables TO service_role;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.project_members pm ON pm.project_id = c.project_id
    WHERE c.id = _channel_id AND pm.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_milestone_member(_milestone_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.milestones m
    JOIN public.project_members pm ON pm.project_id = m.project_id
    WHERE m.id = _milestone_id AND pm.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_project(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members x
    JOIN public.project_members y ON y.project_id = x.project_id
    WHERE x.user_id = _a AND y.user_id = _b
  );
$$;

-- Policies: profiles
CREATE POLICY "profiles_select_self_or_teammates" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_project(id, auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Policies: projects
CREATE POLICY "projects_select_members" ON public.projects FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_project_member(id, auth.uid()));
CREATE POLICY "projects_insert_owner" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update_owner" ON public.projects FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_delete_owner" ON public.projects FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Policies: project_members
CREATE POLICY "members_select" ON public.project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "members_insert_owner" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "members_delete_owner_or_self" ON public.project_members FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR user_id = auth.uid());

-- Policies: channels
CREATE POLICY "channels_select_members" ON public.channels FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "channels_insert_members" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "channels_update_members" ON public.channels FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "channels_delete_owner" ON public.channels FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- Policies: messages
CREATE POLICY "messages_select_members" ON public.messages FOR SELECT TO authenticated
  USING (public.is_channel_member(channel_id, auth.uid()));
CREATE POLICY "messages_insert_members" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_channel_member(channel_id, auth.uid()));
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Policies: tasks
CREATE POLICY "tasks_select_members" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "tasks_insert_members" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "tasks_update_members" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "tasks_delete_members" ON public.tasks FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- Policies: milestones
CREATE POLICY "milestones_select_members" ON public.milestones FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "milestones_insert_members" ON public.milestones FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "milestones_update_members" ON public.milestones FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "milestones_delete_members" ON public.milestones FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- Policies: deliverables
CREATE POLICY "deliverables_select_members" ON public.deliverables FOR SELECT TO authenticated
  USING (public.is_milestone_member(milestone_id, auth.uid()));
CREATE POLICY "deliverables_insert_members" ON public.deliverables FOR INSERT TO authenticated
  WITH CHECK (public.is_milestone_member(milestone_id, auth.uid()));
CREATE POLICY "deliverables_update_members" ON public.deliverables FOR UPDATE TO authenticated
  USING (public.is_milestone_member(milestone_id, auth.uid()))
  WITH CHECK (public.is_milestone_member(milestone_id, auth.uid()));
CREATE POLICY "deliverables_delete_members" ON public.deliverables FOR DELETE TO authenticated
  USING (public.is_milestone_member(milestone_id, auth.uid()));

-- Auto-seed owner membership and default channels on project creation
CREATE OR REPLACE FUNCTION public.seed_new_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.channels (project_id, name, topic, created_by)
  VALUES (NEW.id, 'general', 'Team-wide chatter', NEW.owner_id),
         (NEW.id, 'standup', 'Daily progress updates', NEW.owner_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER seed_new_project_trigger AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_project();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.milestones REPLICA IDENTITY FULL;
ALTER TABLE public.deliverables REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliverables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;