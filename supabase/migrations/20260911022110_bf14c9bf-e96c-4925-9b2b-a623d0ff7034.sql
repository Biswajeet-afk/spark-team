CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_attachments_select_members" ON public.message_attachments FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "message_attachments_insert_members" ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND public.is_project_member(project_id, auth.uid())
    AND public.is_channel_member(channel_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.channel_id = message_attachments.channel_id
    )
  );
CREATE POLICY "message_attachments_delete_own" ON public.message_attachments FOR DELETE TO authenticated
  USING (uploader_id = auth.uid());
CREATE INDEX message_attachments_message_idx ON public.message_attachments (message_id, created_at);
CREATE INDEX message_attachments_channel_idx ON public.message_attachments (channel_id, created_at);

CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_reactions_select_members" ON public.message_reactions FOR SELECT TO authenticated
  USING (public.is_channel_member(channel_id, auth.uid()));
CREATE POLICY "message_reactions_insert_members" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_channel_member(channel_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.channel_id = message_reactions.channel_id
    )
  );
CREATE POLICY "message_reactions_delete_own" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX message_reactions_message_idx ON public.message_reactions (message_id, created_at);
CREATE INDEX message_reactions_channel_idx ON public.message_reactions (channel_id, created_at);

ALTER TABLE public.message_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

CREATE POLICY "project_chat_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-chat'
    AND public.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "project_chat_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-chat'
    AND owner_id = auth.uid()::text
    AND public.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "project_chat_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-chat'
    AND owner_id = auth.uid()::text
    AND public.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );