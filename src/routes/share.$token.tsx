import { createFileRoute, notFound } from "@tanstack/react-router";
import { Eye, FileText } from "lucide-react";
import { getSharedProject } from "@/lib/share.functions";
import { TASK_COLUMNS } from "@/lib/domain";
import { Countdown } from "@/components/app/countdown";

export const Route = createFileRoute("/share/$token")({
  loader: async ({ params }) => {
    const data = await getSharedProject({ data: { token: params.token } });
    if (!data?.project) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.project ? `${loaderData.project.name} — Evaluator view · TeamSync` : "Evaluator view — TeamSync";
    const desc = "Read-only milestone tracker, Kanban status and resource hub for project evaluation.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  errorComponent: () => <p className="p-10 text-center text-sm text-muted-foreground">This link could not be loaded.</p>,
  notFoundComponent: () => <p className="p-10 text-center text-sm text-muted-foreground">This evaluator link is invalid or was revoked.</p>,
  component: SharePage,
});

function SharePage() {
  const d = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-warning uppercase"><Eye className="size-3.5" /> Read-only evaluator view</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.project?.name}</h1>
        {d.project?.description ? <p className="text-sm text-muted-foreground">{d.project.description}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">Team: {d.team.map((t) => `${t.name}${t.position ? ` (${t.position})` : ""}`).join(" · ")}</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Milestone tracker</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {d.milestones.map((m) => {
            const done = m.deliverables.filter((x) => x.is_done).length;
            const pct = m.deliverables.length ? Math.round((done / m.deliverables.length) * 100) : 0;
            return (
              <article key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{m.title}</h3>
                  <Countdown dueAt={m.due_at} />
                </div>
                <div className="mt-2 h-1.5 rounded bg-border"><div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} /></div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {m.deliverables.map((x, i) => <li key={i} className={x.is_done ? "text-muted-foreground line-through" : ""}>{x.is_done ? "✓" : "○"} {x.title}</li>)}
                </ul>
              </article>
            );
          })}
          {d.milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Kanban status</h2>
        <div className="grid gap-3 md:grid-cols-4">
          {TASK_COLUMNS.map((c) => {
            const list = d.tasks.filter((t) => t.status === c.id);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3">
                <p className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{c.label} · {list.length}</p>
                <ul className="space-y-1.5">
                  {list.map((t) => <li key={t.id} className="rounded border border-border bg-background px-2 py-1.5 text-xs">{t.title}<span className="ml-1 text-muted-foreground">· {t.priority}</span></li>)}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Resource hub</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {d.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" /> {f.file_name}
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{(f.file_size / 1024).toFixed(0)} KB · {new Date(f.created_at).toLocaleDateString()}</span>
            </li>
          ))}
          {d.files.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No shared files yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
