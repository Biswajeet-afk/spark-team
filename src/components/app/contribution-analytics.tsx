import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { membersQuery } from "@/lib/queries";
import { displayName } from "@/lib/domain";
import { MemberAvatar } from "@/components/app/member-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const DAYS = 84; // 12 weeks

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function ContributionAnalytics({ projectId }: { projectId: string }) {
  const { data: members = [] } = useQuery(membersQuery(projectId));
  const { data } = useQuery({
    queryKey: ["contributions", projectId],
    queryFn: async () => {
      const since = new Date(Date.now() - DAYS * 864e5).toISOString();
      const { data: channels } = await supabase.from("channels").select("id").eq("project_id", projectId);
      const chIds = (channels ?? []).map((c) => c.id);
      const [tasks, files, decisions, messages] = await Promise.all([
        supabase.from("tasks").select("assignee_id, status, updated_at").eq("project_id", projectId),
        supabase.from("message_attachments").select("uploader_id, created_at").eq("project_id", projectId),
        supabase.from("decisions").select("locked_by, created_at").eq("project_id", projectId),
        chIds.length
          ? supabase.from("messages").select("user_id, created_at, bot").in("channel_id", chIds).gte("created_at", since).limit(5000)
          : Promise.resolve({ data: [] as { user_id: string; created_at: string; bot: string | null }[] }),
      ]);
      return { tasks: tasks.data ?? [], files: files.data ?? [], decisions: decisions.data ?? [], messages: messages.data ?? [] };
    },
  });

  const stats = useMemo(() => {
    if (!data) return [];
    return members.map((m) => {
      const id = m.user_id;
      const heat = new Map<string, number>();
      const bump = (iso: string) => heat.set(iso.slice(0, 10), (heat.get(iso.slice(0, 10)) ?? 0) + 1);
      data.messages.filter((x) => x.user_id === id && !x.bot).forEach((x) => bump(x.created_at));
      data.files.filter((x) => x.uploader_id === id).forEach((x) => bump(x.created_at));
      data.decisions.filter((x) => x.locked_by === id).forEach((x) => bump(x.created_at));
      return {
        member: m,
        tasksDone: data.tasks.filter((t) => t.assignee_id === id && t.status === "done").length,
        tasksOpen: data.tasks.filter((t) => t.assignee_id === id && t.status !== "done").length,
        files: data.files.filter((x) => x.uploader_id === id).length,
        decisions: data.decisions.filter((x) => x.locked_by === id).length,
        messages: data.messages.filter((x) => x.user_id === id && !x.bot).length,
        heat,
      };
    });
  }, [data, members]);

  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date();
    start.setDate(start.getDate() - DAYS + 1);
    for (let i = 0; i < DAYS; i++) out.push(dayKey(new Date(start.getTime() + i * 864e5)));
    return out;
  }, []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><BarChart3 className="size-4" /> Team Contribution</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="size-4" /> Team contribution · last 12 weeks</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {stats.map((s) => (
            <section key={s.member.user_id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <MemberAvatar profile={s.member.profile} className="size-7" />
                <span className="text-sm font-medium">{displayName(s.member.profile)}</span>
                {s.member.position ? <span className="text-xs text-primary">{s.member.position}</span> : null}
              </div>
              <dl className="mt-3 grid grid-cols-5 gap-2 text-center">
                {[
                  ["Tasks done", s.tasksDone],
                  ["Open tasks", s.tasksOpen],
                  ["Files shared", s.files],
                  ["Decisions", s.decisions],
                  ["Messages", s.messages],
                ].map(([label, v]) => (
                  <div key={label} className="rounded-md border border-border bg-background py-2">
                    <dd className="font-mono text-lg">{v}</dd>
                    <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid grid-flow-col grid-rows-7 gap-0.5" aria-label="Activity heatmap">
                {days.map((d) => {
                  const n = s.heat.get(d) ?? 0;
                  const o = n === 0 ? 0.08 : Math.min(1, 0.25 + n * 0.15);
                  return <span key={d} title={`${d}: ${n} actions`} className="size-2.5 rounded-[2px] bg-primary" style={{ opacity: o }} />;
                })}
              </div>
            </section>
          ))}
          {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
