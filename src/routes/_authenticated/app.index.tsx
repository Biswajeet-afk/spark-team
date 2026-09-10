import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { myProfileQuery, projectsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { initials } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/app/")({
  component: ProjectsDashboard,
});

function ProjectsDashboard() {
  const { data: projects, isLoading } = useQuery(projectsQuery);
  const { data: profile } = useQuery(myProfileQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: name.trim(), description: description.trim() || null, owner_id: auth.user.id })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (project) => {
      setOpen(false);
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`${project.name} is ready`);
      void navigate({ to: "/app/p/$projectId", params: { projectId: project.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="scroll-slim flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-12">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">workspace</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}` : "Your projects"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every project has its own channels, board and milestone countdowns.
        </p>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            projects ({projects?.length ?? 0})
          </h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a project</DialogTitle>
                <DialogDescription>
                  We'll set up #general and #standup channels automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Project name</Label>
                  <Input
                    id="p-name"
                    value={name}
                    placeholder="Smart Campus Hackathon"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea
                    id="p-desc"
                    value={description}
                    placeholder="What is the team building?"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || create.isPending}
                >
                  {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-4 space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          ) : (projects ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No projects yet. Create one to open your first channel.
              </p>
            </div>
          ) : (
            (projects ?? []).map((project) => (
              <Link
                key={project.id}
                to="/app/p/$projectId"
                params={{ projectId: project.id }}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-elevated font-mono text-xs font-semibold">
                  {initials(project.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {project.description || "No description"}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
