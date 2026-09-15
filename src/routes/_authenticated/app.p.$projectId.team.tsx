import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { membersQuery, projectQuery, sessionUserQuery } from "@/lib/queries";
import { addMemberByEmail } from "@/lib/team.functions";
import { displayName, realName } from "@/lib/domain";
import { useRealtime } from "@/hooks/use-realtime";
import { DisciplineBadge } from "@/components/app/discipline-badge";
import { MemberAvatar } from "@/components/app/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/team")({
  head: () => ({
    meta: [
      { title: "Team — TeamSync" },
      {
        name: "description",
        content: "Invite teammates by email and see every discipline on your project team.",
      },
      { property: "og:title", content: "Team — TeamSync" },
      {
        property: "og:description",
        content: "Invite teammates by email and see every discipline on your project team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const REASONS: Record<string, string> = {
  not_owner: "Only the project owner can add teammates.",
  no_account:
    "No TeamSync account uses that email yet. Ask them to sign up first, then invite them again.",
  self: "That is your own account — you are already on the team.",
  already_member: "They are already a member of this project.",
};

function TeamPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: project } = useQuery(projectQuery(projectId));
  const { data: members = [] } = useQuery(membersQuery(projectId));
  const { data: user } = useQuery(sessionUserQuery);
  const invite = useServerFn(addMemberByEmail);
  const [email, setEmail] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  const isOwner = !!project && !!user && project.owner_id === user.id;

  useRealtime(`team-${projectId}`, [
    {
      table: "project_members",
      filter: `project_id=eq.${projectId}`,
      invalidate: ["members", projectId],
    },
  ]);

  const addMember = useMutation({
    mutationFn: async () => await invite({ data: { projectId, email: email.trim() } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(REASONS[result.reason] ?? "Could not add that teammate.");
        return;
      }
      setEmail("");
      toast.success("Teammate added — they can see every channel now.");
      await queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", projectId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <main className="scroll-slim min-h-0 flex-1 overflow-y-auto p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Everyone here shares the project's channels, board, and milestones.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-border bg-card/50 p-4">
        <Label htmlFor="invite-email" className="mb-1.5 block">
          Add a teammate by email
        </Label>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            addMember.mutate();
          }}
        >
          <div className="relative flex-1">
            <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@university.edu"
              className="pl-9"
              disabled={!isOwner}
            />
          </div>
          <Button type="submit" disabled={!isOwner || addMember.isPending || !email.trim()}>
            {addMember.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Add to project
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {isOwner
            ? "They need a TeamSync account first — once added, all channels and messages appear for them instantly."
            : "Only the project owner can add teammates."}
        </p>
      </section>

      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3"
          >
            <MemberAvatar profile={member.profile} className="size-9" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{displayName(member.profile)}</p>
                <DisciplineBadge discipline={member.profile?.discipline} />
                {member.role === "owner" ? (
                  <span className="rounded border border-border px-1.5 py-px font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    owner
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {member.profile?.bio?.trim() || "Joined " + new Date(member.joined_at).toLocaleDateString()}
              </p>
            </div>
            {isOwner && member.role !== "owner" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${displayName(member.profile)}`}
                onClick={() => removeMember.mutate(member.user_id)}
              >
                <UserMinus className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
