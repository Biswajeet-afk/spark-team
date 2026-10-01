import { useState } from "react";
import { ChevronDown, Loader2, Send, TerminalSquare } from "lucide-react";
import type { ApiRequest } from "@/lib/api-sandbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-success/15 text-success border-success/40",
  POST: "bg-primary/15 text-primary border-primary/40",
  PUT: "bg-warning/15 text-warning border-warning/40",
  PATCH: "bg-warning/15 text-warning border-warning/40",
  DELETE: "bg-destructive/15 text-destructive border-destructive/40",
};

type Result = { status: number; statusText: string; ms: number; body: string } | { error: string; ms: number };

export function ApiSandboxCard({ request }: { request: ApiRequest }) {
  const [method, setMethod] = useState(request.method);
  const [url, setUrl] = useState(request.url);
  const [headers, setHeaders] = useState(JSON.stringify(request.headers, null, 2));
  const [body, setBody] = useState(request.body);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(true);

  async function send() {
    setLoading(true);
    const started = performance.now();
    try {
      const parsedHeaders = headers.trim() ? (JSON.parse(headers) as Record<string, string>) : {};
      const res = await fetch(url, {
        method,
        headers: parsedHeaders,
        body: method === "GET" || method === "DELETE" || !body ? undefined : body,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not json */
      }
      setResult({ status: res.status, statusText: res.statusText, ms: Math.round(performance.now() - started), body: pretty });
    } catch (e) {
      setResult({
        error: e instanceof Error ? `${e.message} — the server may block browser requests (CORS).` : "Request failed",
        ms: Math.round(performance.now() - started),
      });
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }

  return (
    <div className="w-full min-w-[min(100%,28rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        <TerminalSquare className="size-3.5" /> API test sandbox
      </div>
      <div className="space-y-2 p-3">
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={cn("rounded-md border px-2 font-mono text-xs font-semibold", METHOD_STYLE[method] ?? METHOD_STYLE.GET)}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m} className="bg-card text-foreground">{m}</option>
            ))}
          </select>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 font-mono text-xs" />
          <Button size="sm" onClick={send} disabled={loading || !url}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send
          </Button>
        </div>
        <Tabs defaultValue="body">
          <TabsList className="h-7">
            <TabsTrigger value="body" className="text-xs">Body</TabsTrigger>
            <TabsTrigger value="headers" className="text-xs">Headers</TabsTrigger>
          </TabsList>
          <TabsContent value="body">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="font-mono text-xs" placeholder="{ }" />
          </TabsContent>
          <TabsContent value="headers">
            <Textarea value={headers} onChange={(e) => setHeaders(e.target.value)} rows={4} className="font-mono text-xs" />
          </TabsContent>
        </Tabs>
        {result ? (
          <div className="rounded-md border border-border bg-background">
            <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-1.5 font-mono text-xs">
              {"error" in result ? (
                <span className="text-destructive">Failed</span>
              ) : (
                <span className={result.status < 400 ? "text-success" : "text-destructive"}>
                  {result.status} {result.statusText}
                </span>
              )}
              <span className="text-muted-foreground">{result.ms} ms</span>
              <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
              <pre className="scroll-slim max-h-64 overflow-auto border-t border-border p-3 font-mono text-[11px] whitespace-pre-wrap">
                {"error" in result ? result.error : result.body || "(empty body)"}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
