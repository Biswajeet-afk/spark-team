-- 1. Public username on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- 2. Per-project role title, owner-managed
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS position text;

DROP POLICY IF EXISTS members_update_owner ON public.project_members;
CREATE POLICY members_update_owner ON public.project_members
  FOR UPDATE TO authenticated
  USING (app_private.is_project_owner(project_id, auth.uid()))
  WITH CHECK (app_private.is_project_owner(project_id, auth.uid()));

-- 3. Cascading deletes so an owner can remove a channel or a whole project
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_project_id_fkey;
ALTER TABLE public.channels ADD CONSTRAINT channels_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_project_id_fkey;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.deliverables DROP CONSTRAINT IF EXISTS deliverables_milestone_id_fkey;
ALTER TABLE public.deliverables ADD CONSTRAINT deliverables_milestone_id_fkey
  FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE CASCADE;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_channel_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_channel_id_fkey;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE public.message_attachments DROP CONSTRAINT IF EXISTS message_attachments_message_id_fkey;
ALTER TABLE public.message_attachments ADD CONSTRAINT message_attachments_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_attachments DROP CONSTRAINT IF EXISTS message_attachments_channel_id_fkey;
ALTER TABLE public.message_attachments ADD CONSTRAINT message_attachments_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;
ALTER TABLE public.message_attachments DROP CONSTRAINT IF EXISTS message_attachments_project_id_fkey;
ALTER TABLE public.message_attachments ADD CONSTRAINT message_attachments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 4. Avatar storage policies (bucket "avatars", per-user folder)
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars insert own" ON storage.objects;
CREATE POLICY "avatars insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars update own" ON storage.objects;
CREATE POLICY "avatars update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars delete own" ON storage.objects;
CREATE POLICY "avatars delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);