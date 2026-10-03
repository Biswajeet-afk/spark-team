import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Paperclip, Rocket, ShieldCheck, SmilePlus, Unlock } from "lucide-react";
import { toast } from "sonner";
import type { FileUIPart } from "ai";
import { supabase } from "@/integrations/supabase/client";
import {
  channelQuery,
  membersQuery,
  messageAttachmentsQuery,
  messageReactionsQuery,
  messagesQuery,
} from "@/lib/queries";
import { displayName } from "@/lib/domain";
import { useRealtime } from "@/hooks/use-realtime";
import { detectApiRequest } from "@/lib/api-sandbox";
import { BOTS, detectBot, type BotName } from "@/lib/bots";
import { askBot } from "@/lib/bots.functions";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Attachments, Attachment, AttachmentInfo, AttachmentPreview } from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { MarkdownMessage } from "@/components/app/markdown-message";
import { MemberAvatar } from "@/components/app/member-avatar";
import { ApiSandboxCard } from "@/components/app/api-sandbox-card";
import { DecisionLog } from "@/components/app/decision-log";
import { SerialMonitor } from "@/components/app/serial-monitor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const StlViewer = lazy(() => import("@/components/app/stl-viewer"));

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const EMOJIS = ["👍", "🎉", "❤️", "👀"];

export const Route = createFileRoute("/_authenticated/app/p/$projectId/chat/$channelId")({
  head: () => ({
    meta: [
      { title: "Channel chat — TeamSync" },
      { name: "description", content: "Realtime project channel chat with files, Markdown, and reactions." },
      { property: "og:title", content: "Channel chat — TeamSync" },
      { property: "og:description", content: "Realtime project channel chat with files, Markdown, and reactions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function FileButton() {
  const attachments = usePromptInputAttachments();
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={attachments.openFileDialog} aria-label="Attach files">
      <Paperclip className="size-4" />
    </Button>
  );
}

function BotAvatar({ bot }: { bot: BotName }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-warning text-base">
      {BOTS[bot].emoji}
    </span>
  );
}

function ChatPage() {
  const { projectId, channelId } = Route.useParams();
  const queryClient = useQueryClient();
  const callBot = useServerFn(askBot);
  const { data: channel } = useQuery(channelQuery(channelId));
  const { data: messages = [] } = useQuery(messagesQuery(channelId));
  const { data: attachments = [] } = useQuery(messageAttachmentsQuery(channelId));
  const { data: reactions = [] } = useQuery(messageReactionsQuery(channelId));
  const { data: members = [] } = useQuery(membersQuery(projectId));
  const { data: auth } = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const [locking, setLocking] = useState<{ id: string; title: string; category: string } | null>(null);
  const [botThinking, setBotThinking] = useState<BotName | null>(null);
  const isHardware = /hardware|circuit/i.test(channel?.name ?? "");

  useRealtime(`chat-${channelId}`, [
    { table: "messages", filter: `channel_id=eq.${channelId}`, invalidate: ["messages", channelId] },
    { table: "message_attachments", filter: `channel_id=eq.${channelId}`, invalidate: ["message-attachments", channelId] },
    { table: "message_reactions", filter: `channel_id=eq.${channelId}`, invalidate: ["message-reactions", channelId] },
  ]);

  const sendMessage = useMutation({
    mutationFn: async ({ text, files }: { text: string; files: FileUIPart[] }) => {
      if (!auth) throw new Error("Sign in again to send a message.");
      if (!text.trim() && files.length === 0) throw new Error("Write a message or attach a file.");
      const api = detectApiRequest(text);
      const { data: message, error } = await supabase
        .from("messages")
        .insert({ channel_id: channelId, user_id: auth.id, content: text.trim(), api_payload: api ?? null })
        .select("id")
        .single();
      if (error) throw error;

      for (const [index, item] of files.entries()) {
        if (!item.url) continue;
        const response = await fetch(item.url);
        const blob = await response.blob();
        const safeName = (item.filename ?? `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${projectId}/${channelId}/${message.id}/${crypto.randomUUID()}-${safeName}`;
        const upload = await supabase.storage.from("project-chat").upload(path, blob, { contentType: item.mediaType });
        if (upload.error) throw upload.error;
        const record = await supabase.from("message_attachments").insert({
          message_id: message.id,
          project_id: projectId,
          channel_id: channelId,
          uploader_id: auth.id,
          storage_path: path,
          file_name: safeName,
          mime_type: item.mediaType ?? (blob.type || "application/octet-stream"),
          file_size: blob.size,
        });
        if (record.error) throw record.error;
      }
      return detectBot(text);
    },
    onSuccess: async (bot) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", channelId] }),
        queryClient.invalidateQueries({ queryKey: ["message-attachments", channelId] }),
      ]);
      if (bot) {
        setBotThinking(bot);
        callBot({ data: { channelId, bot } })
          .then(() => queryClient.invalidateQueries({ queryKey: ["messages", channelId] }))
          .catch((e: Error) => toast.error(e.message))
          .finally(() => setBotThinking(null));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji, mine }: { messageId: string; emoji: string; mine: boolean }) => {
      if (!auth) throw new Error("Sign in again to react.");
      const result = mine
        ? await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", auth.id).eq("emoji", emoji)
        : await supabase.from("message_reactions").insert({ message_id: messageId, channel_id: channelId, user_id: auth.id, emoji });
      if (result.error) throw result.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["message-reactions", channelId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; lock: boolean; title?: string; category?: string }) => {
      const { error } = await supabase.rpc("set_message_decision", {
        _message_id: v.id,
        _lock: v.lock,
        _title: v.title ?? "",
        _category: v.category ?? "General",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.lock ? "Locked as decision" : "Decision unlocked");
      setLocking(null);
      void queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
      void queryClient.invalidateQueries({ queryKey: ["decisions", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const attachmentsByMessage = useMemo(() => groupBy(attachments, (item) => item.message_id), [attachments]);
  const roleByUser = useMemo(() => new Map(members.map((member) => [member.user_id, member.position])), [members]);
  const profileById = useMemo(() => new Map(members.map((m) => [m.user_id, m.profile])), [members]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-base font-semibold"># {channel?.name ?? "channel"}</h1>
          <p className="truncate text-xs text-muted-foreground">{channel?.topic ?? "Project conversation"}</p>
        </div>
        {isHardware ? <SerialMonitor /> : null}
        <DecisionLog projectId={projectId} />
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" asChild>
          <Link to="/app/p/$projectId/pitch" params={{ projectId }}><Rocket className="size-3.5 text-primary" /> Launch Pitch Mode</Link>
        </Button>
      </header>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-4xl gap-1 px-5 py-5">
          {messages.length === 0 ? <ConversationEmptyState title="No messages yet" description="Start the conversation. Tip: mention @circuit-bot, @pitch-bot or @api-bot." /> : null}
          {messages.map((message) => {
            const bot = message.bot && message.bot in BOTS ? (message.bot as BotName) : null;
            const mine = !bot && message.user_id === auth?.id;
            const messageAttachments = attachmentsByMessage.get(message.id) ?? [];
            const messageReactions = reactions.filter((reaction) => reaction.message_id === message.id);
            const grouped = groupBy(messageReactions, (reaction) => reaction.emoji);
            const api = !bot ? detectApiRequest(message.content) : null;
            const locker = message.locked_by ? profileById.get(message.locked_by) : null;
            return (
              <Message key={message.id} from={mine ? "user" : "assistant"} className="group/message py-2">
                {bot ? <BotAvatar bot={bot} /> : !mine ? <MemberAvatar profile={message.profile} className="mt-0.5 size-8" /> : null}
                <div className={`min-w-0 max-w-[85%] ${message.is_decision ? "border-l-2 border-warning pl-3" : ""}`}>
                  <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{bot ? BOTS[bot].label : mine ? "You" : displayName(message.profile)}</span>
                    {bot ? (
                      <span className="rounded bg-gradient-to-r from-primary to-warning px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary-foreground">AI BOT</span>
                    ) : roleByUser.get(message.user_id) ? (
                      <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-medium tracking-wide text-primary">
                        {roleByUser.get(message.user_id)}
                      </span>
                    ) : null}
                    <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    {message.is_decision ? (
                      <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] font-medium text-warning">
                        <ShieldCheck className="size-3" /> Locked Decision · {message.decision_category}
                        {locker ? ` · by @${displayName(locker)}` : ""}
                      </span>
                    ) : null}
                  </div>
                  {message.is_decision && message.decision_title ? (
                    <p className="mb-1 text-sm font-semibold text-warning">{message.decision_title}</p>
                  ) : null}
                  <MessageContent className={mine && !api ? "bg-primary text-primary-foreground" : "bg-transparent p-0 text-foreground"}>
                    {api ? <ApiSandboxCard request={api} /> : message.content ? <MarkdownMessage content={message.content} /> : null}
                    {messageAttachments.length > 0 ? (
                      <div className="mt-2 flex w-full flex-col gap-2">
                        {messageAttachments.map((item) => {
                          const lower = item.file_name.toLowerCase();
                          if (lower.endsWith(".stl") && item.url)
                            return (
                              <Suspense key={item.id} fallback={<div className="h-64 rounded-lg border border-border bg-card" />}>
                                <StlViewer url={item.url} name={item.file_name} />
                              </Suspense>
                            );
                          if (lower.endsWith(".pdf") && item.url)
                            return (
                              <div key={item.id} className="w-full min-w-[min(100%,26rem)] overflow-hidden rounded-lg border border-border bg-card">
                                <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
                                  <FileText className="size-3.5 text-primary" /> {item.file_name}
                                  <Download className="ml-auto size-3.5 text-muted-foreground" />
                                </a>
                                <iframe title={item.file_name} src={item.url} className="h-80 w-full bg-background" />
                              </div>
                            );
                          return (
                            <Attachments key={item.id} variant="list">
                              <a href={item.url ?? undefined} download={item.file_name} target="_blank" rel="noreferrer" className="w-full">
                                <Attachment data={{ id: item.id, type: "file", filename: item.file_name, mediaType: item.mime_type, url: item.url ?? "" }}>
                                  <AttachmentPreview />
                                  <AttachmentInfo showMediaType />
                                  <Download className="size-4 text-muted-foreground" />
                                </Attachment>
                              </a>
                            </Attachments>
                          );
                        })}
                      </div>
                    ) : null}
                  </MessageContent>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {Array.from(grouped).map(([emoji, rows]) => {
                      const selected = rows.some((row) => row.user_id === auth?.id);
                      return <Button key={emoji} type="button" variant={selected ? "secondary" : "outline"} size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={() => react.mutate({ messageId: message.id, emoji, mine: selected })}>{emoji} {rows.length}</Button>;
                    })}
                    <div className="flex items-center opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                      <SmilePlus className="mr-1 size-3.5 self-center text-muted-foreground" />
                      {EMOJIS.map((emoji) => <button key={emoji} type="button" className="px-0.5 text-sm" aria-label={`React ${emoji}`} onClick={() => react.mutate({ messageId: message.id, emoji, mine: messageReactions.some((row) => row.emoji === emoji && row.user_id === auth?.id) })}>{emoji}</button>)}
                      {message.is_decision ? (
                        <button type="button" className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-warning" onClick={() => decide.mutate({ id: message.id, lock: false })}>
                          <Unlock className="size-3.5" /> Unlock
                        </button>
                      ) : (
                        <button type="button" className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-warning" onClick={() => setLocking({ id: message.id, title: message.content.slice(0, 60), category: "" })}>
                          <ShieldCheck className="size-3.5" /> Lock as Decision
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Message>
            );
          })}
          {botThinking ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <BotAvatar bot={botThinking} /> {BOTS[botThinking].label} is thinking…
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-4xl px-5 pb-5">
        <PromptInput accept="*/*" multiple maxFiles={5} maxFileSize={10 * 1024 * 1024} onError={(error) => toast.error(error.message)} onSubmit={async (message) => { await sendMessage.mutateAsync(message); }}>
          <PromptInputTextarea placeholder={`Message #${channel?.name ?? "channel"} — try @circuit-bot, @pitch-bot, @api-bot`} />
          <PromptInputFooter>
            <FileButton />
            <PromptInputSubmit disabled={sendMessage.isPending} status={sendMessage.isPending ? "submitted" : "ready"} />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <Dialog open={!!locking} onOpenChange={(o) => !o && setLocking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-warning" /> Lock as decision</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dec-cat">Category</Label>
              <Input id="dec-cat" placeholder="Database, Hardware, API…" value={locking?.category ?? ""} onChange={(e) => setLocking((l) => l && { ...l, category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dec-title">Decision</Label>
              <Input id="dec-title" placeholder="PostgreSQL" value={locking?.title ?? ""} onChange={(e) => setLocking((l) => l && { ...l, title: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={decide.isPending || !locking?.category.trim()} onClick={() => locking && decide.mutate({ id: locking.id, lock: true, title: locking.title.trim(), category: locking.category.trim() })}>
              Lock decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
