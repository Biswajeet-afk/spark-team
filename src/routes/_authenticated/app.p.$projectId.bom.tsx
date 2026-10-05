import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { projectQuery } from "@/lib/queries";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/bom")({
  head: () => ({
    meta: [
      { title: "Project BOM — TeamSync" },
      { name: "description", content: "Live bill of materials with total cost and power budget." },
      { property: "og:title", content: "Project BOM — TeamSync" },
      { property: "og:description", content: "Live bill of materials with total cost and power budget." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BomPage,
});

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function BomPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const { data: project } = useQuery(projectQuery(projectId));
  const currency = project?.currency ?? "INR";
  const sym = SYMBOL[currency] ?? "₹";
  const key = ["bom", projectId];
  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("bom_items").select("*").eq("project_id", projectId).order("created_at")).data ?? [],
  });
  useRealtime(`bom-${projectId}`, [{ table: "bom_items", filter: `project_id=eq.${projectId}`, invalidate: key }]);
  const [draft, setDraft] = useState({ name: "", unit_cost: "", quantity: "1", power_ma: "" });

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Component name is required");
      const { error } = await supabase.from("bom_items").insert({
        project_id: projectId,
        name: draft.name.trim(),
        unit_cost: Number(draft.unit_cost) || 0,
        quantity: Math.max(1, Math.round(Number(draft.quantity) || 1)),
        power_ma: Number(draft.power_ma) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDraft({ name: "", unit_cost: "", quantity: "1", power_ma: "" }); void refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; unit_cost?: number; quantity?: number; power_ma?: number } }) => {
      const { error } = await supabase.from("bom_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void refresh(),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bom_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void refresh(),
  });
  const setCurrency = useMutation({
    mutationFn: async (c: string) => {
      const { error } = await supabase.from("projects").update({ currency: c }).eq("id", projectId);
      if (error) throw new Error("Only the project owner can change the currency.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const totalCost = items.reduce((s, i) => s + Number(i.unit_cost) * i.quantity, 0);
  const totalMa = items.reduce((s, i) => s + Number(i.power_ma) * i.quantity, 0);
  const fmt = (n: number) => `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <main className="scroll-slim min-h-0 flex-1 overflow-y-auto p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Project BOM</h1>
          <p className="text-sm text-muted-foreground">Bill of materials with live cost and power budget.</p>
        </div>
        <select value={currency} onChange={(e) => setCurrency.mutate(e.target.value)} className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-sm">
          <option value="INR">₹ INR</option>
          <option value="USD">$ USD</option>
        </select>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Total cost</p>
          <p className="mt-1 font-mono text-2xl">{fmt(totalCost)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Est. current draw</p>
          <p className="mt-1 flex items-center gap-1 font-mono text-2xl text-warning"><Zap className="size-5" />{totalMa.toLocaleString()} mA</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Battery life (2000 mAh)</p>
          <p className="mt-1 font-mono text-2xl">{totalMa > 0 ? `${(2000 / totalMa).toFixed(1)} h` : "—"}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Component</th>
              <th className="px-3 py-2">Unit cost ({sym})</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Power (mA)</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="px-3 py-2 text-right">Draw</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-1.5"><Input defaultValue={i.name} className="h-8" onBlur={(e) => e.target.value !== i.name && update.mutate({ id: i.id, patch: { name: e.target.value } })} /></td>
                <td className="px-3 py-1.5"><Input type="number" step="0.01" defaultValue={i.unit_cost} className="h-8 w-28" onBlur={(e) => update.mutate({ id: i.id, patch: { unit_cost: Number(e.target.value) || 0 } })} /></td>
                <td className="px-3 py-1.5"><Input type="number" min={1} defaultValue={i.quantity} className="h-8 w-20" onBlur={(e) => update.mutate({ id: i.id, patch: { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} /></td>
                <td className="px-3 py-1.5"><Input type="number" step="0.1" defaultValue={i.power_ma} className="h-8 w-24" onBlur={(e) => update.mutate({ id: i.id, patch: { power_ma: Number(e.target.value) || 0 } })} /></td>
                <td className="px-3 py-1.5 text-right font-mono">{fmt(Number(i.unit_cost) * i.quantity)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{Number(i.power_ma) * i.quantity} mA</td>
                <td className="px-2"><Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => remove.mutate(i.id)}><Trash2 className="size-4" /></Button></td>
              </tr>
            ))}
            <tr className="border-t border-border bg-card/50">
              <td className="px-3 py-1.5"><Input placeholder="ESP32-WROOM" value={draft.name} className="h-8" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
              <td className="px-3 py-1.5"><Input type="number" placeholder="350" value={draft.unit_cost} className="h-8 w-28" onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} /></td>
              <td className="px-3 py-1.5"><Input type="number" value={draft.quantity} className="h-8 w-20" onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></td>
              <td className="px-3 py-1.5"><Input type="number" placeholder="240" value={draft.power_ma} className="h-8 w-24" onChange={(e) => setDraft({ ...draft, power_ma: e.target.value })} /></td>
              <td colSpan={3} className="px-3 py-1.5 text-right">
                <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}><Plus className="size-4" /> Add</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
