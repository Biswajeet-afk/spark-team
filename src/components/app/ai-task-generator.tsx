import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { channelsQuery, membersQuery } from "@/lib/queries";
import { draftTasksFromChat, type DraftTask } from "@/lib/ai-tasks.functions";
import { displayName } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "text-destructive border-destructive/40",
  high: "text-warning border-warning/40",
  medium: "text-primary border-primary/40",
  low: "text-muted-foreground border-border",
};

export function AiTaskGenerator({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const draft = useServerFn(draftTasksFromChat);
  const { data: channels = [] } = useQuery(channelsQuery(projectId));
  const { data: members = [] } = useQuery(membersQuery(projectId));
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string>("");
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<(DraftTask & { keep: boolean })[]>([]);

  const generate = useMutation({
    mutationFn: () => draft({ data: { projectId, channelId: channelId || null, discussion: text } }),
    onSuccess: (r) => {
      setTasks(r.tasks.map((t) => ({ ...t, keep: true })));
      if (!r.tasks.length) toast.info("No actionable tasks found in that discussion.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const rows = tasks.filter((t) => t.keep).map((t, i) => ({
        project_id: projectId,
        title: t.title,
        description: t.description || null,
        priority: t.priority,
        assignee_id: t.assignee_id,
        due_date: t.due_date,
        status: "backlog" as const,
        position: Date.now() + i,
        created_by: auth.user?.id ?? null,
      }));
      if (!rows.length) throw new Error("Select at least one task.");
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} tasks to Backlog`);
      setOpen(false);
      setTasks([]);
      setText("");
      void qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Wand2 className="size-4 text-primary" /> Tasks from chat</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> Turn a discussion into tasks</DialogTitle>
        </DialogHeader>
        {tasks.length === 0 ? (
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Use recent messages from a channel</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— none, use pasted text only —</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            <label className="block text-xs text-muted-foreground">…and/or paste a discussion</label>
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste meeting notes or chat here" />
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t, i) => {
              const who = members.find((m) => m.user_id === t.assignee_id);
              return (
                <li key={i} className="flex gap-3 rounded-md border border-border bg-card p-3">
                  <Checkbox checked={t.keep} onCheckedChange={(v) => setTasks(tasks.map((x, j) => (j === i ? { ...x, keep: !!v } : x)))} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 font-mono text-[10px] uppercase ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                      <span className="text-sm font-medium">{t.title}</span>
                    </div>
                    {t.description ? <p className="mt-1 text-xs text-muted-foreground">{t.description}</p> : null}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {who ? `→ ${displayName(who.profile)}` : "unassigned"}{t.due_date ? ` · due ${t.due_date}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          {tasks.length ? (
            <>
              <Button variant="ghost" onClick={() => setTasks([])}>Start over</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>
                {add.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Add {tasks.filter((t) => t.keep).length} to board
              </Button>
            </>
          ) : (
            <Button onClick={() => generate.mutate()} disabled={generate.isPending || (!channelId && !text.trim())}>
              {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {generate.isPending ? "Analysing…" : "Generate tasks"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
