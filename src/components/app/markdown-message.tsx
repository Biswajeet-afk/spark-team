import { useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="group/code relative">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded border border-border bg-elevated px-1.5 py-1 font-mono text-[10px] tracking-wide text-muted-foreground opacity-0 transition hover:text-foreground group-hover/code:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        {copied ? "COPIED" : "COPY"}
      </button>
      <pre ref={ref} className="scroll-slim">
        {children}
      </pre>
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="md-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
