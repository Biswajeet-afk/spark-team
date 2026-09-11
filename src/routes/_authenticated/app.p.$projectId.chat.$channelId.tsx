import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import type { FileUIPart } from "ai";
import { supabase } from "@/integrations/supabase/client";
import {
  channelQuery,
  messageAttachmentsQuery,
  messageReactionsQuery,
  messagesQuery,
} from "@/lib/queries";
import { displayName } from "@/lib/domain";
import { useRealtime } from "@/hooks/use-realtime";
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
import { Button } from "@/components/ui/button";

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

function ChatPage() {
  const { projectId, channelId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: channel } = useQuery(channelQuery(channelId));
  const { data: messages = [] } = useQuery(messagesQuery(channelId));
  const { data: attachments = [] } = useQuery(messageAttachmentsQuery(channelId));
  const { data: reactions = [] } = useQuery(messageReactionsQuery(channelId));
  const { data: auth } = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user });

  useRealtime(`chat-${channelId}`, [
    { table: "messages", filter: `channel_id=eq.${channelId}`, invalidate: ["messages", channelId] },
    { table: "message_attachments", filter: `channel_id=eq.${channelId}`, invalidate: ["message-attachments", channelId] },
    { table: "message_reactions", filter: `channel_id=eq.${channelId}`, invalidate: ["message-reactions", channelId] },
  ]);

  const sendMessage = useMutation({
    mutationFn: async ({ text, files }: { text: string; files: FileUIPart[] }) => {
      if (!auth) throw new Error("Sign in again to send a message.");
      if (!text.trim() && files.length === 0) throw new Error("Write a message or attach a file.");
      const { data: message, error } = await supabase
        .from("messages")
        .insert({ channel_id: channelId, user_id: auth.id, content: text.trim() })
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
          mime_type: item.mediaType ?? blob.type || "application/octet-stream",
          file_size: blob.size,
        });
        if (record.error) throw record.error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", channelId] }),
        queryClient.invalidateQueries({ queryKey: ["message-attachments", channelId] }),
      ]);
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

  const attachmentsByMessage = useMemo(() => Map.groupBy(attachments, (item) => item.message_id), [attachments]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold"># {channel?.name ?? "channel"}</h1>
        <p className="text-xs text-muted-foreground">{channel?.topic ?? "Project conversation"}</p>
      </header>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-4xl gap-1 px-5 py-5">
          {messages.length === 0 ? <ConversationEmptyState title="No messages yet" description="Start the conversation." /> : null}
          {messages.map((message) => {
            const mine = message.user_id === auth?.id;
            const messageAttachments = attachmentsByMessage.get(message.id) ?? [];
            const messageReactions = reactions.filter((reaction) => reaction.message_id === message.id);
            const grouped = Map.groupBy(messageReactions, (reaction) => reaction.emoji);
            return (
              <Message key={message.id} from={mine ? "user" : "assistant"} className="group/message py-2">
                {!mine ? <MemberAvatar profile={message.profile} className="mt-0.5 size-8" /> : null}
                <div className="min-w-0 max-w-[85%]">
                  <div className="mb-1 flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{mine ? "You" : displayName(message.profile)}</span>
                    <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                  <MessageContent className={mine ? "bg-primary text-primary-foreground" : "bg-transparent p-0 text-foreground"}>
                    {message.content ? <MarkdownMessage content={message.content} /> : null}
                    {messageAttachments.length > 0 ? (
                      <Attachments variant="list" className="mt-2">
                        {messageAttachments.map((item) => (
                          <a key={item.id} href={item.url ?? undefined} download={item.file_name} target="_blank" rel="noreferrer" className="w-full">
                            <Attachment data={{ type: "file", filename: item.file_name, mediaType: item.mime_type, url: item.url ?? undefined }}>
                              <AttachmentPreview />
                              <AttachmentInfo showMediaType />
                              <Download className="size-4 text-muted-foreground" />
                            </Attachment>
                          </a>
                        ))}
                      </Attachments>
                    ) : null}
                  </MessageContent>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {Array.from(grouped).map(([emoji, rows]) => {
                      const selected = rows.some((row) => row.user_id === auth?.id);
                      return <Button key={emoji} type="button" variant={selected ? "secondary" : "outline"} size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={() => react.mutate({ messageId: message.id, emoji, mine: selected })}>{emoji} {rows.length}</Button>;
                    })}
                    <div className="flex opacity-0 transition-opacity group-hover/message:opacity-100">
                      <SmilePlus className="mr-1 size-3.5 self-center text-muted-foreground" />
                      {EMOJIS.map((emoji) => <button key={emoji} type="button" className="px-0.5 text-sm" aria-label={`React ${emoji}`} onClick={() => react.mutate({ messageId: message.id, emoji, mine: messageReactions.some((row) => row.emoji === emoji && row.user_id === auth?.id) })}>{emoji}</button>)}
                    </div>
                  </div>
                </div>
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-4xl px-5 pb-5">
        <PromptInput accept="*/*" multiple maxFiles={5} maxFileSize={10 * 1024 * 1024} onError={(error) => toast.error(error.message)} onSubmit={async (message) => sendMessage.mutateAsync(message)}>
          <PromptInputTextarea placeholder={`Message #${channel?.name ?? "channel"}`} />
          <PromptInputFooter>
            <FileButton />
            <PromptInputSubmit disabled={sendMessage.isPending} status={sendMessage.isPending ? "submitted" : "ready"} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}