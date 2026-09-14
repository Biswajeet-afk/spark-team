import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBannerDismissed } from "@/lib/notification-prefs";
import type { PermissionState } from "@/hooks/use-message-notifications";

const COPY: Record<Exclude<PermissionState, "granted">, { text: string; action?: string }> = {
  default: {
    text: "Turn on desktop alerts to hear about new messages while you work elsewhere.",
    action: "Enable alerts",
  },
  denied: {
    text: "Desktop alerts are blocked. Allow notifications for this site in your browser settings to get them back.",
  },
  "blocked-iframe": {
    text: "Open TeamSync in its own browser tab to enable desktop alerts — previews inside another page can't ask for them.",
  },
  unsupported: {
    text: "This browser doesn't support desktop alerts. Unread counts still show in the tab title.",
  },
};

export function NotificationBanner(props: {
  permission: PermissionState;
  onEnable: () => void;
}) {
  const [dismissed, setDismissed] = useBannerDismissed();
  if (props.permission === "granted" || dismissed) return null;
  const copy = COPY[props.permission];

  return (
    <div className="flex items-start gap-3 border-b border-border bg-card/70 px-5 py-2.5 text-xs">
      {props.permission === "default" ? (
        <Bell className="mt-0.5 size-3.5 shrink-0 text-primary" />
      ) : (
        <BellOff className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <p className="min-w-0 flex-1 text-muted-foreground">{copy.text}</p>
      {copy.action ? (
        <Button size="sm" className="h-6 px-2 text-xs" onClick={props.onEnable}>
          {copy.action}
        </Button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification notice"
        className="text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
