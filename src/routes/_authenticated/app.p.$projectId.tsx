import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, KanbanSquare, Loader2, Plus, Target, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { channelsQuery, membersQuery, projectQuery, sessionUserQuery } from "@/lib/queries";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/p/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const routeParams = useParams({ strict: false }) as { channelId?: string };
  const { data: project } = useQuery(projectQuery(projectId));
  const { data: channels } = useQuery(channelsQuery(projectId));
  const { data: members } = useQuery(membersQuery(projectId));
  const { data: user } = useQuery(sessionUserQuery);
  const navigate = useNavigate();
  const isOwner = !!project && !!user && project.owner_id === user.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [channelName, setChannelName] = useState("");

  useRealtime(`project-sidebar-${projectId}`, [
    { table: "channels", filter: `project_id=eq.${projectId}`, invalidate: ["channels", projectId] },
    { table: "project_members", filter: `project_id=eq.${projectId}`, invalidate: ["members", projectId] },
  ]);

  const createChannel = useMutation({
    mutationFn: async () => {
      const slug = channelName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_ ]/g, "")
        .replace(/\s+/g, "-");
      if (!slug) throw new Error("Pick a channel name");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("channels")
        .insert({ project_id: projectId, name: slug, created_by: auth.user?.id ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setOpen(false);
      setChannelName("");
      await queryClient.invalidateQueries({ queryKey: ["channels", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteChannel = useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", channelId);
      if (error) throw new Error(error.message);
      return channelId;
    },
    onSuccess: async (channelId) => {
      toast.success("Channel deleted");
      await queryClient.invalidateQueries({ queryKey: ["channels", projectId] });
      if (routeParams.channelId === channelId) {
        navigate({ to: "/app/p/$projectId", params: { projectId } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const navItems = [
    { to: "/app/p/$projectId/board" as const, label: "Board", icon: KanbanSquare },
    { to: "/app/p/$projectId/milestones" as const, label: "Milestones", icon: Target },
    { to: "/app/p/$projectId/team" as const, label: "Team", icon: Users },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="truncate text-sm font-semibold tracking-tight">
            {project?.name ?? "Loading…"}
          </p>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            {members?.length ?? 0} members
          </p>
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto px-2 py-3">
          <div className="flex items-center justify-between px-2">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              channels
            </span>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="New channel"
                >
                  <Plus className="size-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New channel</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="ch-name">Channel name</Label>
                  <Input
                    id="ch-name"
                    placeholder="design-reviews"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createChannel.mutate()}
                    disabled={createChannel.isPending || !channelName.trim()}
                  >
                    {createChannel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <ul className="mt-1.5 space-y-0.5">
            {(channels ?? []).map((channel) => {
              const active = routeParams.channelId === channel.id;
              return (
                <li key={channel.id}>
                  <Link
                    to="/app/p/$projectId/chat/$channelId"
                    params={{ projectId, channelId: channel.id }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <Hash className="size-3.5 shrink-0" />
                    <span className="truncate">{channel.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <span className="mt-5 mb-1.5 block px-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            project
          </span>
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  params={{ projectId }}
                  activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <item.icon className="size-3.5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
