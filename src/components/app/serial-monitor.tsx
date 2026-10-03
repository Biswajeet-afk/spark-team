import { useEffect, useRef, useState } from "react";
import { Cpu, Plug, Unplug } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type SerialPortLike = {
  open: (o: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};
type SerialNav = { serial?: { requestPort: () => Promise<SerialPortLike> } };

const BAUDS = [9600, 19200, 38400, 57600, 115200];
const SERIES_COLORS = ["var(--primary)", "var(--warning)", "var(--success)", "var(--destructive)"];

export function SerialMonitor() {
  const [baud, setBaud] = useState(115200);
  const [lines, setLines] = useState<string[]>([]);
  const [points, setPoints] = useState<Record<string, number>[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const tick = useRef(0);
  const supported = typeof navigator !== "undefined" && !!(navigator as unknown as SerialNav).serial;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => () => void disconnect(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function ingest(line: string) {
    setLines((l) => [...l.slice(-400), line]);
    const nums = line.split(/[,\s;]+/).filter(Boolean).map(Number);
    if (nums.length && nums.every((n) => Number.isFinite(n))) {
      const row: Record<string, number> = { t: tick.current++ };
      nums.slice(0, 4).forEach((n, i) => (row[`ch${i + 1}`] = n));
      setPoints((p) => [...p.slice(-120), row]);
    }
  }

  async function connect() {
    setError(null);
    try {
      const port = await (navigator as unknown as SerialNav).serial!.requestPort();
      await port.open({ baudRate: baud });
      portRef.current = port;
      setConnected(true);
      const reader = port.readable!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        parts.forEach((p) => p.trim() && ingest(p.trim()));
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "NotFoundError") setError(e.message);
    } finally {
      setConnected(false);
    }
  }

  async function disconnect() {
    try {
      await readerRef.current?.cancel();
      readerRef.current?.releaseLock();
      await portRef.current?.close();
    } catch {
      /* already closed */
    }
    portRef.current = null;
    setConnected(false);
  }

  const seriesKeys = points.length ? Object.keys(points[points.length - 1] ?? {}).filter((k) => k !== "t") : [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Cpu className="size-3.5" /> Connect Microcontroller
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Cpu className="size-4" /> Serial monitor</SheetTitle>
        </SheetHeader>
        {!supported ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            USB serial needs Chrome or Edge on desktop, opened in its own tab (not the embedded preview).
          </p>
        ) : null}
        <div className="flex items-center gap-2 px-4">
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={connected} className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs">
            {BAUDS.map((b) => <option key={b} value={b}>{b} baud</option>)}
          </select>
          {connected ? (
            <Button size="sm" variant="destructive" onClick={disconnect}><Unplug className="size-3.5" /> Disconnect</Button>
          ) : (
            <Button size="sm" onClick={connect} disabled={!supported}><Plug className="size-3.5" /> Connect</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setLines([]); setPoints([]); }}>Clear</Button>
          <span className={`ml-auto size-2 rounded-full ${connected ? "bg-success" : "bg-muted-foreground"}`} />
        </div>
        {error ? <p className="px-4 text-xs text-destructive">{error}</p> : null}
        <div className="h-48 px-4">
          {points.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <XAxis dataKey="t" hide />
                <YAxis width={36} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} />
                {seriesKeys.map((k, i) => (
                  <Line key={k} dataKey={k} dot={false} isAnimationActive={false} stroke={SERIES_COLORS[i]} strokeWidth={1.5} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              Comma-separated numbers (e.g. 24.5, 60) are graphed live
            </div>
          )}
        </div>
        <pre ref={logRef} className="scroll-slim mx-4 mb-4 min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] text-success">
          {lines.length ? lines.join("\n") : "Waiting for data…"}
        </pre>
      </SheetContent>
    </Sheet>
  );
}
