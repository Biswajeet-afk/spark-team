import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { playMessageChime } from "@/lib/notification-prefs";
import { displayName } from "@/lib/domain";
import type { Message } from "@/lib/domain";

export type PermissionState = "unsupported" | "blocked-iframe" | "default" | "granted" | "denied";

const BASE_TITLE = "TeamSync";

function currentPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as "default" | "granted" | "denied";
}

/**
 * One global listener for incoming chat messages. Fires a desktop notification
 * and chime when the message is not from you and you are not already looking at
 * its channel, and reflects the unread count in the browser tab title.
 */
export function useMessageNotifications(options: {
  userId: string | undefined;
  activeChannelId: string | undefined;
}) {
  const { userId, activeChannelId } = options;
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [unread, setUnread] = useState(0);
  const activeRef = useRef(activeChannelId);
  activeRef.current = activeChannelId;

  useEffect(() => {
    setPermission(
      typeof window !== "undefined" && window.top !== window.self && Notification?.permission === "default"
        ? "blocked-iframe"
        : currentPermission(),
    );
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    if (window.top !== window.self) {
      setPermission("blocked-iframe");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
  }, []);

  // Ask once per session as soon as the workspace opens.
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (window.top !== window.self) return;
    void Notification.requestPermission().then((result) => setPermission(result as PermissionState));
  }, [userId]);

  // Clear the badge when the user comes back to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setUnread(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Reading a channel clears the badge too.
  useEffect(() => {
    if (activeChannelId && !document.hidden) setUnread(0);
  }, [activeChannelId]);

  useEffect(() => {
    const previous = document.title;
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = previous;
    };
  }, [unread]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`message-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new as Message;
          if (!message || message.user_id === userId) return;

          void queryClient.invalidateQueries({ queryKey: ["messages", message.channel_id] });

          const reading = activeRef.current === message.channel_id && !document.hidden;
          if (reading) return;

          setUnread((count) => count + 1);
          playMessageChime();

          void (async () => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name,email,avatar_url")
              .eq("id", message.user_id)
              .maybeSingle();
            const sender = displayName(profile);
            const snippet =
              message.content.trim().slice(0, 120) + (message.content.trim().length > 120 ? "…" : "");
            if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
            try {
              const notification = new Notification(sender, {
                body: snippet || "Sent an attachment",
                icon: profile?.avatar_url ?? "/favicon.ico",
                tag: `message-${message.channel_id}`,
              });
              notification.onclick = () => {
                window.focus();
                notification.close();
              };
            } catch {
              // Some browsers require a service worker; the in-app badge still covers it.
            }
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return { permission, unread, requestPermission, clearUnread: () => setUnread(0) };
}
