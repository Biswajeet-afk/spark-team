import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/board")({
  component: BoardPage,
});

function BoardPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="flex-1 p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Board</h1>
        <p className="text-sm text-muted-foreground">
          Project ID: {projectId}
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">Kanban board placeholder</p>
      </div>
    </div>
  );
}
