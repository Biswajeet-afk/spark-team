ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_decision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_title text,
  ADD COLUMN IF NOT EXISTS decision_category text,
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS api_payload jsonb,
  ADD COLUMN IF NOT EXISTS bot text;

-- Any channel member may lock/unlock a message as a decision.
CREATE OR REPLACE FUNCTION public.set_message_decision(_message_id uuid, _lock boolean, _title text, _category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ch uuid; _project uuid;
BEGIN
  SELECT m.channel_id, c.project_id INTO _ch, _project FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = _message_id;
  IF _ch IS NULL OR NOT app_private.is_channel_member(_ch, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _lock THEN
    UPDATE messages SET is_decision = true, decision_title = _title, decision_category = _category, locked_by = auth.uid() WHERE id = _message_id;
    INSERT INTO decisions (project_id, channel_id, message_id, category, title, locked_by)
      VALUES (_project, _ch, _message_id, coalesce(_category,'General'), _title, auth.uid())
      ON CONFLICT (message_id) DO UPDATE SET category = excluded.category, title = excluded.title, locked_by = excluded.locked_by;
  ELSE
    UPDATE messages SET is_decision = false, decision_title = null, decision_category = null, locked_by = null WHERE id = _message_id;
    DELETE FROM decisions WHERE message_id = _message_id;
  END IF;
END $$;

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'General',
  title text,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY decisions_select_members ON public.decisions FOR SELECT TO authenticated
  USING (app_private.is_project_member(project_id, auth.uid()));

REVOKE ALL ON FUNCTION public.set_message_decision(uuid, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_message_decision(uuid, boolean, text, text) TO authenticated;

CREATE TABLE public.pitch_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  script_text text NOT NULL DEFAULT '',
  timer_seconds integer NOT NULL DEFAULT 180,
  slides_url text,
  qa_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_scripts TO authenticated;
GRANT ALL ON public.pitch_scripts TO service_role;
ALTER TABLE public.pitch_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY pitch_select ON public.pitch_scripts FOR SELECT TO authenticated USING (app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY pitch_insert ON public.pitch_scripts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY pitch_update ON public.pitch_scripts FOR UPDATE TO authenticated USING (app_private.is_project_member(project_id, auth.uid())) WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY pitch_delete ON public.pitch_scripts FOR DELETE TO authenticated USING (app_private.is_project_owner(project_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pitch_scripts;