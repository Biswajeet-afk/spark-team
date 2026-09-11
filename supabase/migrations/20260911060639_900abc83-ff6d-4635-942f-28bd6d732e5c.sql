CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION app_private.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION app_private.is_channel_member(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.project_members pm ON pm.project_id = c.project_id
    WHERE c.id = _channel_id AND pm.user_id = _user_id
  );
$$;
CREATE OR REPLACE FUNCTION app_private.is_milestone_member(_milestone_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.milestones m
    JOIN public.project_members pm ON pm.project_id = m.project_id
    WHERE m.id = _milestone_id AND pm.user_id = _user_id
  );
$$;
CREATE OR REPLACE FUNCTION app_private.shares_project(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members x
    JOIN public.project_members y ON y.project_id = x.project_id
    WHERE x.user_id = _a AND y.user_id = _b
  );
$$;
REVOKE ALL ON FUNCTION app_private.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_project_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_channel_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_milestone_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.shares_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_project_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_project_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_channel_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_milestone_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.shares_project(uuid, uuid) TO authenticated, service_role;

ALTER POLICY "profiles_select_self_or_teammates" ON public.profiles USING (id = auth.uid() OR app_private.shares_project(id, auth.uid()));
ALTER POLICY "projects_select_members" ON public.projects USING (owner_id = auth.uid() OR app_private.is_project_member(id, auth.uid()));
ALTER POLICY "projects_update_owner" ON public.projects USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER POLICY "members_select" ON public.project_members USING (user_id = auth.uid() OR app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "members_insert_owner" ON public.project_members WITH CHECK (app_private.is_project_owner(project_id, auth.uid()));
ALTER POLICY "members_delete_owner_or_self" ON public.project_members USING (app_private.is_project_owner(project_id, auth.uid()) OR user_id = auth.uid());
ALTER POLICY "channels_select_members" ON public.channels USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "channels_insert_members" ON public.channels WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "channels_update_members" ON public.channels USING (app_private.is_project_member(project_id, auth.uid())) WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "channels_delete_owner" ON public.channels USING (app_private.is_project_owner(project_id, auth.uid()));
ALTER POLICY "messages_select_members" ON public.messages USING (app_private.is_channel_member(channel_id, auth.uid()));
ALTER POLICY "messages_insert_members" ON public.messages WITH CHECK (user_id = auth.uid() AND app_private.is_channel_member(channel_id, auth.uid()));
ALTER POLICY "tasks_select_members" ON public.tasks USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "tasks_insert_members" ON public.tasks WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "tasks_update_members" ON public.tasks USING (app_private.is_project_member(project_id, auth.uid())) WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "tasks_delete_members" ON public.tasks USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "milestones_select_members" ON public.milestones USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "milestones_insert_members" ON public.milestones WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "milestones_update_members" ON public.milestones USING (app_private.is_project_member(project_id, auth.uid())) WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "milestones_delete_members" ON public.milestones USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "deliverables_select_members" ON public.deliverables USING (app_private.is_milestone_member(milestone_id, auth.uid()));
ALTER POLICY "deliverables_insert_members" ON public.deliverables WITH CHECK (app_private.is_milestone_member(milestone_id, auth.uid()));
ALTER POLICY "deliverables_update_members" ON public.deliverables USING (app_private.is_milestone_member(milestone_id, auth.uid())) WITH CHECK (app_private.is_milestone_member(milestone_id, auth.uid()));
ALTER POLICY "deliverables_delete_members" ON public.deliverables USING (app_private.is_milestone_member(milestone_id, auth.uid()));
ALTER POLICY "message_attachments_select_members" ON public.message_attachments USING (app_private.is_project_member(project_id, auth.uid()));
ALTER POLICY "message_attachments_insert_members" ON public.message_attachments WITH CHECK (uploader_id = auth.uid() AND app_private.is_project_member(project_id, auth.uid()) AND app_private.is_channel_member(channel_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.channel_id = message_attachments.channel_id));
ALTER POLICY "message_reactions_select_members" ON public.message_reactions USING (app_private.is_channel_member(channel_id, auth.uid()));
ALTER POLICY "message_reactions_insert_members" ON public.message_reactions WITH CHECK (user_id = auth.uid() AND app_private.is_channel_member(channel_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.channel_id = message_reactions.channel_id));
ALTER POLICY "project_chat_files_select" ON storage.objects USING (bucket_id = 'project-chat' AND app_private.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid()));
ALTER POLICY "project_chat_files_insert" ON storage.objects WITH CHECK (bucket_id = 'project-chat' AND owner_id = auth.uid()::text AND app_private.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid()));
ALTER POLICY "project_chat_files_delete" ON storage.objects USING (bucket_id = 'project-chat' AND owner_id = auth.uid()::text AND app_private.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid()));

REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_channel_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_milestone_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shares_project(uuid, uuid) FROM PUBLIC, anon, authenticated;