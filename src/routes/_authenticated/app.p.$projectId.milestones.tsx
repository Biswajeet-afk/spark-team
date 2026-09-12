import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { milestonesQuery } from "@/lib/queries";
import type { Deliverable } from "@/lib/domain";
import { useRealtime } from "@/hooks/use-realtime";
import { Countdown } from "@/components/app/countdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/milestones")({
  head: () => ({
    meta: [
      { title: "Milestones — TeamSync" },
      {
        name: "description",
        content: "Live countdown timers and deliverable checklists for every project milestone.",
      },
      { property: "og:title", content: "Milestones — TeamSync" },
      {
        property: "og:description",
        content: "Live countdown timers and deliverable checklists for every project milestone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MilestonesPage,
});

function MilestonesPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: milestones = [], isLoading } = useQuery(milestonesQuery(projectId));

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useRealtime(`milestones-${projectId}`, [
    {
      table: "milestones",
      filter: `project_id=eq.${projectId}`,
      invalidate: ["milestones", projectId],
    },
    { table: "deliverables", invalidate: ["milestones", projectId] },
  ]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["milestones", projectId] });

  const createMilestone = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the milestone a title.");
      if (!dueAt) throw new Error("Pick a deadline.");
      const { error } = await supabase.from("milestones").insert({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: new Date(dueAt).toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setDueAt("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addDeliverable = useMutation({
    mutationFn: async ({ milestoneId, text }: { milestoneId: string; text: string }) => {
      if (!text.trim()) throw new Error("Describe the deliverable.");
      const { error } = await supabase.from("deliverables").insert({
        milestone_id: milestoneId,
        title: text.trim(),
        position: Date.now(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_data, variables) => {
      setDrafts((current) => ({ ...current, [variables.milestoneId]: "" }));
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleDeliverable = useMutation({
    mutationFn: async (item: Deliverable) => {
      const { error } = await supabase
        .from("deliverables")
        .update({ is_done: !item.is_done })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMilestone = useMutation({
    mutationFn: async (milestoneId: string) => {
      const { error } = await supabase.from("milestones").delete().eq("id", milestoneId);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <main className="scroll-slim min-h-0 flex-1 overflow-y-auto p-6">
      <header className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Milestones</h1>
          <p className="text-sm text-muted-foreground">
            Deadlines counting down live, with deliverables you can tick off together.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="ml-auto">
              <Plus className="size-4" />
              New milestone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ms-title">Title</Label>
                <Input
                  id="ms-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Hackathon final demo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ms-desc">Description</Label>
                <Textarea
                  id="ms-desc"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What has to be true when this milestone lands?"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ms-due">Deadline</Label>
                <Input
                  id="ms-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMilestone.mutate()}
                disabled={createMilestone.isPending || !title.trim() || !dueAt}
              >
                {createMilestone.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading milestones…</p>
      ) : milestones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Target className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No milestones yet. Add your first deadline to start the countdown.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {milestones.map((milestone) => {
            const done = milestone.deliverables.filter((item) => item.is_done).length;
            const total = milestone.deliverables.length;
            const percent = total ? Math.round((done / total) * 100) : 0;
            return (
              <article
                key={milestone.id}
                className="rounded-xl border border-border bg-card/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold tracking-tight">
                      {milestone.title}
                    </h2>
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                      {new Date(milestone.due_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Delete milestone"
                    onClick={() => removeMilestone.mutate(milestone.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {milestone.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{milestone.description}</p>
                ) : null}

                <Countdown dueAt={milestone.due_at} className="mt-3" />

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    <span>deliverables</span>
                    <span>
                      {done}/{total} · {percent}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {milestone.deliverables.map((item) => (
                      <li key={item.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`d-${item.id}`}
                          checked={item.is_done}
                          onCheckedChange={() => toggleDeliverable.mutate(item)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`d-${item.id}`}
                          className={
                            item.is_done
                              ? "text-sm leading-5 text-muted-foreground line-through"
                              : "text-sm leading-5"
                          }
                        >
                          {item.title}
                        </Label>
                      </li>
                    ))}
                  </ul>

                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addDeliverable.mutate({
                        milestoneId: milestone.id,
                        text: drafts[milestone.id] ?? "",
                      });
                    }}
                  >
                    <Input
                      value={drafts[milestone.id] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [milestone.id]: event.target.value,
                        }))
                      }
                      placeholder="Add a deliverable"
                      className="h-9"
                    />
                    <Button type="submit" size="sm" variant="secondary">
                      Add
                    </Button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
