import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/p/chat/")({
  component: ChatPage,
});

function ChatPage() {
  const { projectId, channelId } = Route.useParams();
  return (
    <div className="flex-1 p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Project ID: {projectId} • Channel ID: {channelId}
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">Chat interface placeholder</p>
      </div>
    </div>
  );
}
