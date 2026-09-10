import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Sub = {
  table: string;
  filter?: string;
  invalidate: readonly unknown[];
};

/**
 * Subscribes to live row changes for the given tables and refreshes the
 * matching cached queries. One channel per hook call, torn down on unmount.
 */
export function useRealtime(channelName: string, subs: Sub[]) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(subs);

  useEffect(() => {
    const parsed = JSON.parse(key) as Sub[];
    const channel = supabase.channel(channelName);
    for (const sub of parsed) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: sub.invalidate });
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, key, queryClient]);
}

/** Tracks who is currently online in a project via Realtime presence. */
export function usePresence(
  roomName: string,
  me: { id: string; name: string } | null,
  onChange: (userIds: string[]) => void,
) {
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(roomName, { config: { presence: { key: me.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        onChange(Object.keys(channel.presenceState()));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ name: me.name, at: new Date().toISOString() });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, me?.id, me?.name]);
}
