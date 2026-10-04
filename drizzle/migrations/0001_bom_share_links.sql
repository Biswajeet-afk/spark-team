CREATE TABLE public.bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  power_ma numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_items TO authenticated;
GRANT ALL ON public.bom_items TO service_role;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bom_select ON public.bom_items FOR SELECT TO authenticated USING (app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY bom_insert ON public.bom_items FOR INSERT TO authenticated WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY bom_update ON public.bom_items FOR UPDATE TO authenticated USING (app_private.is_project_member(project_id, auth.uid())) WITH CHECK (app_private.is_project_member(project_id, auth.uid()));
CREATE POLICY bom_delete ON public.bom_items FOR DELETE TO authenticated USING (app_private.is_project_member(project_id, auth.uid()));

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY share_select_owner ON public.share_links FOR SELECT TO authenticated USING (app_private.is_project_owner(project_id, auth.uid()));
CREATE POLICY share_insert_owner ON public.share_links FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND app_private.is_project_owner(project_id, auth.uid()));
CREATE POLICY share_delete_owner ON public.share_links FOR DELETE TO authenticated USING (app_private.is_project_owner(project_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.bom_items;