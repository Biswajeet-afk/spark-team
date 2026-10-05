import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function ShareLinkCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const key = ["share-links", projectId];
  const { data: links = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("share_links").select("*").eq("project_id", projectId).order("created_at")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("share_links").insert({ project_id: projectId, created_by: auth.user!.id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("share_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const url = (token: string) => `${window.location.origin}/share/${token}`;

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> Evaluator / faculty link</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        View-only page with milestones, Kanban status and shared files. No chat access or posting. Revoke anytime.
      </p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1 text-xs">{url(l.token)}</code>
            <Button size="icon-sm" variant="ghost" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(url(l.token)); toast.success("Link copied"); }}><Copy className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Revoke link" onClick={() => revoke.mutate(l.id)}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-3" onClick={() => create.mutate()} disabled={create.isPending}>Generate view-only link</Button>
    </section>
  );
}
