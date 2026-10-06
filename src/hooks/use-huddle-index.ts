import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Project-wide index of who is in which channel's huddle. One presence channel
 * per project, owned by the project layout; huddles report via setMyHuddle.
 */
type Channel = ReturnType<typeof supabase.channel>;
let active: { channel: Channel; ready: boolean; pending: string | null } | null = null;

export function setMyHuddle(channelId: string | null) {
  if (!active) return;
  active.pending = channelId;
  if (!active.ready) return;
  if (channelId) void active.channel.track({ channelId });
  else void active.channel.untrack();
}

export function useHuddleIndex(projectId: string, userId: string | undefined) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`huddle-index-${projectId}`, { config: { presence: { key: userId } } });
    const entry = { channel, ready: false, pending: null as string | null };
    active = entry;
    channel
      .on("presence", { event: "sync" }, () => {
        const next: Record<string, number> = {};
        for (const metas of Object.values(channel.presenceState<{ channelId: string }>())) {
          const id = metas[0]?.channelId;
          if (id) next[id] = (next[id] ?? 0) + 1;
        }
        setCounts(next);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        entry.ready = true;
        if (entry.pending) void channel.track({ channelId: entry.pending });
      });
    return () => {
      if (active === entry) active = null;
      void supabase.removeChannel(channel);
    };
  }, [projectId, userId]);
  return counts;
}
