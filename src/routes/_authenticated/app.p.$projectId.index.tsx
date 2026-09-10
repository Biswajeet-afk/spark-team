import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { channelsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/p/$projectId/")({
  component: ProjectHome,
});

function ProjectHome() {
  const { projectId } = Route.useParams();
  const { data: channels, isLoading } = useQuery(channelsQuery(projectId));
  const navigate = useNavigate();

  const firstChannelId = channels?.[0]?.id;

  useEffect(() => {
    if (!firstChannelId) return;
    void navigate({
      to: "/app/p/$projectId/chat/$channelId",
      params: { projectId, channelId: firstChannelId },
      replace: true,
    });
  }, [firstChannelId, navigate, projectId]);

  return (
    <div className="grid flex-1 place-items-center">
      <p className="text-sm text-muted-foreground">
        {isLoading ? "Opening channel…" : "Create a channel to start talking."}
      </p>
    </div>
  );
}
