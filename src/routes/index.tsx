import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hash, KanbanSquare, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sessionUserQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "TeamSync — Realtime team workspace for hackathons" },
      {
        name: "description",
        content:
          "A dark, keyboard-fast workspace where student project teams chat in channels, run a Kanban board and count down to every milestone.",
      },
      { property: "og:title", content: "TeamSync — Realtime team workspace for hackathons" },
      {
        property: "og:description",
        content:
          "Channels with code-aware chat, a live Kanban board and milestone countdowns for multidisciplinary project teams.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Hash,
    title: "Code-aware channels",
    body: "Markdown and fenced code blocks with syntax highlighting and one-click copy. Messages land instantly for everyone in the room.",
  },
  {
    icon: KanbanSquare,
    title: "Kanban that keeps up",
    body: "Backlog to Done with drag-and-drop, assignees, priorities and due dates — synced live across the whole team.",
  },
  {
    icon: Timer,
    title: "Milestones on the clock",
    body: "Every milestone gets a running countdown and a deliverables checklist, so demo day never sneaks up on you.",
  },
  {
    icon: Users,
    title: "Discipline badges",
    body: "Engineering, design, business, data, research — see who you're talking to next to every message and task.",
  },
];

function Landing() {
  const { data: user } = useQuery(sessionUserQuery);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded bg-primary font-mono text-[11px] font-bold text-primary-foreground">
              TS
            </span>
            <span className="text-sm font-semibold tracking-tight">TeamSync</span>
          </span>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to="/app">Open workspace</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Create account
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="grid-backdrop border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
              built for project weeks &amp; hackathons
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              One dark room for your whole multidisciplinary team.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              Chat with real code blocks, move tasks across a live board, and watch the countdown to
              your next deliverable — without juggling four different tools.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to={user ? "/app" : "/auth"} search={user ? undefined : { mode: "signup" }}>
                  {user ? "Open workspace" : "Start a team"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                free · realtime · no setup
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <feature.icon className="size-5 text-primary" />
                <h2 className="mt-4 text-base font-semibold tracking-tight">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 font-mono text-xs text-muted-foreground">
          <span>TeamSync</span>
          <Link to="/auth" className="hover:text-foreground">
            sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
