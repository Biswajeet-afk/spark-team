import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { membersQuery, tasksQuery } from "@/lib/queries";
import {
  PRIORITIES,
  TASK_COLUMNS,
  displayName,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/app/member-avatar";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/board")({
  head: () => ({
    meta: [
      { title: "Task board — TeamSync" },
      {
        name: "description",
        content: "Drag-and-drop Kanban board for your university project team's tasks.",
      },
      { property: "og:title", content: "Task board — TeamSync" },
      {
        property: "og:description",
        content: "Drag-and-drop Kanban board for your university project team's tasks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardPage,
});

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "text-muted-foreground border-border",
  medium: "text-disc-data border-disc-data/40",
  high: "text-warning border-warning/40",
  urgent: "text-destructive border-destructive/40",
};

function TaskCard({
  task,
  assignee,
}: {
  task: Task;
  assignee: Profile | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-elevated p-3 shadow-sm transition-colors hover:border-ring/60",
        isDragging && "z-50 opacity-80",
      )}
      {...listeners}
      {...attributes}
    >
      <p className="text-sm leading-snug font-medium">{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-px font-mono text-[10px] tracking-wider uppercase",
            PRIORITY_TONE[task.priority],
          )}
        >
          {task.priority}
        </span>
        {task.due_date ? (
          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <CalendarClock className="size-3" />
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        ) : null}
        <div className="ml-auto">
          {assignee ? <MemberAvatar profile={assignee} className="size-6" /> : null}
        </div>
      </div>
    </div>
  );
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 w-full flex-col rounded-xl border border-border/70 bg-card/40 p-2.5 transition-colors",
        isOver && "border-ring bg-card/70",
      )}
    >
      <header className="flex items-center justify-between px-1 pb-2">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      </header>
      <div className="scroll-slim flex flex-1 flex-col gap-2 overflow-y-auto">{children}</div>
    </section>
  );
}

function BoardPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery(tasksQuery(projectId));
  const { data: members = [] } = useQuery(membersQuery(projectId));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [dueDate, setDueDate] = useState("");

  useRealtime(`board-${projectId}`, [
    { table: "tasks", filter: `project_id=eq.${projectId}`, invalidate: ["tasks", projectId] },
  ]);

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const column of TASK_COLUMNS) map.set(column.status, []);
    for (const task of tasks) map.get(task.status)?.push(task);
    return map;
  }, [tasks]);

  const createTask = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the task a title.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assignee_id: assignee === "unassigned" ? null : assignee,
        due_date: dueDate || null,
        created_by: auth.user?.id ?? null,
        position: Date.now(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setAssignee("unassigned");
      await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status: next }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("project_id", projectId)
        .eq("status", "done");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function onDragEnd(event: DragEndEvent) {
    const next = event.over?.id as TaskStatus | undefined;
    const id = String(event.active.id);
    if (!next) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === next) return;
    queryClient.setQueryData<Task[]>(["tasks", projectId], (current) =>
      (current ?? []).map((item) => (item.id === id ? { ...item, status: next } : item)),
    );
    moveTask.mutate({ id, next });
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6">
      <header className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Board</h1>
          <p className="text-sm text-muted-foreground">
            Drag cards between columns to update progress.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(byStatus.get("done")?.length ?? 0) > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteDone.mutate()}
              disabled={deleteDone.isPending}
            >
              <Trash2 className="size-4" />
              Clear done
            </Button>
          ) : null}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New task</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-title">Title</Label>
                  <Input
                    id="task-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Wire up the results dashboard"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-desc">Details</Label>
                  <Textarea
                    id="task-desc"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional context, links, acceptance criteria"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Column</Label>
                    <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_COLUMNS.map((column) => (
                          <SelectItem key={column.status} value={column.status}>
                            {column.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Select
                      value={priority}
                      onValueChange={(value) => setPriority(value as TaskPriority)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assignee</Label>
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {displayName(member.profile)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-due">Due date</Label>
                    <Input
                      id="task-due"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createTask.mutate()}
                  disabled={createTask.isPending || !title.trim()}
                >
                  {createTask.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create task
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TASK_COLUMNS.map((column) => {
            const columnTasks = byStatus.get(column.status) ?? [];
            return (
              <Column
                key={column.status}
                status={column.status}
                label={column.label}
                count={columnTasks.length}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    assignee={members.find((m) => m.user_id === task.assignee_id)?.profile ?? null}
                  />
                ))}
                {columnTasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    Drop tasks here
                  </p>
                ) : null}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </main>
  );
}
