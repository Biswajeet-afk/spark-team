import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookLock, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { displayName } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function DecisionLog({ projectId }: { projectId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["decisions", projectId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("decisions")
        .select("*, channel:channels(name), message:messages(content)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set(rows.map((r) => r.locked_by).filter(Boolean))) as string[];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("*").in("id", ids) : { data: [] };
      return rows.map((r) => ({ ...r, locker: profiles?.find((p) => p.id === r.locked_by) ?? null }));
    },
  });
  useRealtime(`decisions-${projectId}`, [
    { table: "decisions", filter: `project_id=eq.${projectId}`, invalidate: ["decisions", projectId] },
  ]);

  const byChannel = useMemo(() => {
    const map = new Map<string, typeof data>();
    for (const d of data) {
      const k = d.channel?.name ?? "channel";
      map.set(k, [...(map.get(k) ?? []), d]);
    }
    return map;
  }, [data]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <BookLock className="size-3.5 text-warning" /> Decision Log
          <span className="rounded bg-warning/15 px-1 font-mono text-[10px] text-warning">{data.length}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><BookLock className="size-4 text-warning" /> Decision log</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No locked decisions yet. Hover a message and choose "Lock as decision".</p>
          ) : null}
          {Array.from(byChannel).map(([channel, rows]) => (
            <section key={channel}>
              <h3 className="mb-2 flex items-center gap-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                <Hash className="size-3" /> {channel}
              </h3>
              <ul className="space-y-2">
                {rows.map((d) => (
                  <li key={d.id} className="rounded-md border border-border border-l-2 border-l-warning bg-card p-3">
                    <Link to="/app/p/$projectId/chat/$channelId" params={{ projectId, channelId: d.channel_id }} className="block">
                      <p className="text-sm font-medium">
                        <span className="text-warning">{d.category}:</span> {d.title || d.message?.content?.slice(0, 80)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.message?.content}</p>
                      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                        locked by {displayName(d.locker)} · {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
