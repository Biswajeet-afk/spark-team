import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type QaCard = { title: string; body: string };
const DEFAULT_CARDS: QaCard[] = [
  { title: "Architecture", body: "Client → API → Database. Describe the data flow here." },
  { title: "Tech stack rationale", body: "Why each technology was chosen." },
  { title: "Market viability", body: "Target users, market size, key metrics." },
];

export const Route = createFileRoute("/_authenticated/app/p/$projectId/pitch")({
  head: () => ({
    meta: [
      { title: "Pitch Mode — TeamSync" },
      { name: "description", content: "Teleprompter, synced slides and judge Q&A cheat sheet for your hackathon pitch." },
      { property: "og:title", content: "Pitch Mode — TeamSync" },
      { property: "og:description", content: "Teleprompter, synced slides and judge Q&A cheat sheet for your hackathon pitch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PitchPage,
});

function TimerRing({ left, total }: { left: number; total: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const color = frac > 0.33 ? "var(--primary)" : frac > 0.1 ? "var(--warning)" : "var(--destructive)";
  return (
    <svg viewBox="0 0 100 100" className="size-28">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" className="fill-foreground font-mono" fontSize="18">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </text>
    </svg>
  );
}

function embedUrl(url: string, slide: number) {
  const g = url.match(/docs\.google\.com\/presentation\/d\/([^/]+)/);
  if (g) return `https://docs.google.com/presentation/d/${g[1]}/embed?start=false&rm=minimal#slide=${slide}`;
  return url;
}

function PitchPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const { data: pitch, isLoading } = useQuery({
    queryKey: ["pitch", projectId],
    queryFn: async () => (await supabase.from("pitch_scripts").select("*").eq("project_id", projectId).maybeSingle()).data,
  });
  const [script, setScript] = useState("");
  const [seconds, setSeconds] = useState(180);
  const [slidesUrl, setSlidesUrl] = useState("");
  const [cards, setCards] = useState<QaCard[]>(DEFAULT_CARDS);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(180);
  const [speed, setSpeed] = useState(30);
  const [slide, setSlide] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!pitch) return;
    setScript(pitch.script_text);
    setSeconds(pitch.timer_seconds);
    setLeft(pitch.timer_seconds);
    setSlidesUrl(pitch.slides_url ?? "");
    if (Array.isArray(pitch.qa_cards) && pitch.qa_cards.length) setCards(pitch.qa_cards as QaCard[]);
  }, [pitch]);

  // Slide sync: broadcast slide changes to everyone in pitch mode.
  useEffect(() => {
    const ch = supabase.channel(`pitch-${projectId}`);
    ch.on("broadcast", { event: "slide" }, ({ payload }) => setSlide(Number(payload.slide) || 1)).subscribe();
    channelRef.current = ch;
    return () => void supabase.removeChannel(ch);
  }, [projectId]);

  function goSlide(n: number) {
    const next = Math.max(1, n);
    setSlide(next);
    void channelRef.current?.send({ type: "broadcast", event: "slide", payload: { slide: next } });
  }

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let raf = 0;
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (scrollRef.current) scrollRef.current.scrollTop += speed * dt;
      acc += dt;
      if (acc >= 1) {
        acc -= 1;
        setLeft((l) => {
          if (l <= 1) setRunning(false);
          return Math.max(0, l - 1);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const row = { project_id: projectId, user_id: auth.user!.id, script_text: script, timer_seconds: seconds, slides_url: slidesUrl || null, qa_cards: cards };
      const { error } = await supabase.from("pitch_scripts").upsert(row, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pitch saved");
      setEditing(false);
      setLeft(seconds);
      void qc.invalidateQueries({ queryKey: ["pitch", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <span className="font-mono text-xs tracking-widest text-primary uppercase">🚀 Pitch mode</span>
        <div className="ml-auto flex gap-2">
          {editing ? (
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-3.5" /> Save</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={isLoading}>Edit pitch</Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/app/p/$projectId" params={{ projectId }}><X className="size-4" /> Exit</Link>
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1fr_1.4fr_1fr]">
        <section className="flex min-h-0 flex-col bg-background p-4">
          <div className="flex items-center gap-4">
            <TimerRing left={left} total={seconds} />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setRunning((r) => !r)}>{running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{running ? "Pause" : "Start"}</Button>
                <Button size="sm" variant="outline" onClick={() => { setRunning(false); setLeft(seconds); scrollRef.current?.scrollTo({ top: 0 }); }}><RotateCcw className="size-3.5" /></Button>
              </div>
              <label className="block text-xs text-muted-foreground">Scroll speed</label>
              <Slider value={[speed]} min={5} max={120} step={5} onValueChange={(v) => setSpeed(v[0])} />
              {editing ? (
                <Input type="number" value={seconds} min={30} onChange={(e) => setSeconds(Number(e.target.value) || 180)} className="h-7 text-xs" aria-label="Timer seconds" />
              ) : null}
            </div>
          </div>
          {editing ? (
            <Textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Write your pitch script…" className="mt-4 min-h-0 flex-1 resize-none text-base" />
          ) : (
            <div ref={scrollRef} className="scroll-slim mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-5 text-2xl leading-relaxed whitespace-pre-wrap">
              {script || "No script yet — click Edit pitch to write one."}
              <div className="h-[60vh]" />
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col bg-background p-4">
          {editing ? (
            <Input value={slidesUrl} onChange={(e) => setSlidesUrl(e.target.value)} placeholder="Google Slides / PDF / slide deck link" className="mb-3" />
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
            {slidesUrl ? (
              <iframe key={slide} title="Slides" src={embedUrl(slidesUrl, slide)} className="size-full" allowFullScreen />
            ) : (
              <div className="grid size-full place-items-center text-sm text-muted-foreground">Add a slide deck link in Edit pitch</div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button size="sm" variant="outline" onClick={() => goSlide(slide - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="font-mono text-sm">Slide {slide}</span>
            <Button size="sm" variant="outline" onClick={() => goSlide(slide + 1)}><ChevronRight className="size-4" /></Button>
            <span className="text-xs text-muted-foreground">synced to teammates in pitch mode</span>
          </div>
        </section>

        <section className="scroll-slim min-h-0 overflow-y-auto bg-background p-4">
          <h2 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Judge Q&amp;A cheat sheet</h2>
          {editing ? (
            <div className="space-y-3">
              {cards.map((c, i) => (
                <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                  <div className="flex gap-2">
                    <Input value={c.title} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-7 text-xs" />
                    <Button size="icon-sm" variant="ghost" onClick={() => setCards(cards.filter((_, j) => j !== i))} aria-label="Remove card"><Trash2 className="size-3.5" /></Button>
                  </div>
                  <Textarea value={c.body} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} rows={3} className="text-xs" />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setCards([...cards, { title: "New card", body: "" }])}><Plus className="size-3.5" /> Add card</Button>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {cards.map((c, i) => (
                <AccordionItem key={i} value={String(i)} className="rounded-md border border-border px-3">
                  <AccordionTrigger className="text-sm">{c.title}</AccordionTrigger>
                  <AccordionContent className="text-sm whitespace-pre-wrap text-muted-foreground">{c.body}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>
      </div>
    </div>
  );
}
