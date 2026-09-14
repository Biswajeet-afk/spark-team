import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { myProfileQuery, projectsQuery } from "@/lib/queries";
import { MemberAvatar } from "@/components/app/member-avatar";
import { initials } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMessageNotifications } from "@/hooks/use-message-notifications";
import { NotificationBanner } from "@/components/app/notification-banner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

function AppShell() {
  const { data: projects } = useQuery(projectsQuery);
  const { data: profile } = useQuery(myProfileQuery);
  const params = useParams({ strict: false }) as { projectId?: string; channelId?: string };
  const { permission, requestPermission } = useMessageNotifications({
    userId: profile?.id,
    activeChannelId: params.channelId,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-3">
          <Link
            to="/app"
            className="grid size-9 place-items-center rounded-lg bg-primary font-mono text-[11px] font-bold text-primary-foreground"
            aria-label="TeamSync home"
          >
            TS
          </Link>
          <span className="my-1 h-px w-6 bg-sidebar-border" />
          <div className="scroll-slim flex flex-1 flex-col items-center gap-2 overflow-y-auto">
            {(projects ?? []).map((project) => {
              const active = params.projectId === project.id;
              return (
                <Tooltip key={project.id}>
                  <TooltipTrigger asChild>
                    <Link
                      to="/app/p/$projectId"
                      params={{ projectId: project.id }}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg border font-mono text-[11px] font-semibold transition-colors",
                        active
                          ? "border-primary/60 bg-primary/15 text-foreground"
                          : "border-sidebar-border bg-sidebar-accent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {initials(project.name)}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{project.name}</TooltipContent>
                </Tooltip>
              );
            })}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/app"
                  className="grid size-9 place-items-center rounded-lg border border-dashed border-sidebar-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  aria-label="All projects"
                >
                  <Plus className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">New project</TooltipContent>
            </Tooltip>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MemberAvatar profile={profile} className="size-9" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
              <DropdownMenuLabel className="truncate">
                {profile?.full_name || profile?.email || "You"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/settings">
                  <Settings className="size-4" /> Profile settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <NotificationBanner permission={permission} onEnable={() => void requestPermission()} />
          <div className="flex min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
