import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "./domain";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const sessionUserQuery = queryOptions({
  queryKey: ["auth", "user"],
  queryFn: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  },
  staleTime: 30_000,
});

export const myProfileQuery = queryOptions({
  queryKey: ["profile", "me"],
  queryFn: async (): Promise<Profile | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const existing = unwrap(
      await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    );
    if (existing) return existing;
    const meta = (user.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
    return unwrap(
      await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email ?? null,
          full_name: meta.full_name ?? user.email?.split("@")[0] ?? "",
          avatar_url: meta.avatar_url ?? null,
        })
        .select("*")
        .single(),
    );
  },
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: async () =>
    unwrap(await supabase.from("projects").select("*").order("created_at", { ascending: false })),
});

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: async () =>
      unwrap(await supabase.from("projects").select("*").eq("id", projectId).single()),
  });

export const channelsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["channels", projectId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("channels")
          .select("*")
          .eq("project_id", projectId)
          .order("name", { ascending: true }),
      ),
  });

export const membersQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["members", projectId],
    queryFn: async () => {
      const members = unwrap(
        await supabase.from("project_members").select("*").eq("project_id", projectId),
      );
      const ids = members.map((m) => m.user_id);
      const profiles = ids.length
        ? unwrap(await supabase.from("profiles").select("*").in("id", ids))
        : [];
      return members
        .map((m) => ({ ...m, profile: profiles.find((p) => p.id === m.user_id) ?? null }))
        .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
    },
  });

export const messagesQuery = (channelId: string) =>
  queryOptions({
    queryKey: ["messages", channelId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("messages")
          .select("*")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: true })
          .limit(300),
      ),
  });

export const messageAttachmentsQuery = (channelId: string) =>
  queryOptions({
    queryKey: ["message-attachments", channelId],
    queryFn: async () => {
      const attachments = unwrap(
        await supabase
          .from("message_attachments")
          .select("*")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: true }),
      );
      return Promise.all(
        attachments.map(async (attachment) => {
          const { data } = await supabase.storage
            .from("project-chat")
            .createSignedUrl(attachment.storage_path, 3600);
          return { ...attachment, url: data?.signedUrl ?? null };
        }),
      );
    },
  });

export const messageReactionsQuery = (channelId: string) =>
  queryOptions({
    queryKey: ["message-reactions", channelId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("message_reactions")
          .select("*")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: true }),
      ),
  });

export const tasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["tasks", projectId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("tasks")
          .select("*")
          .eq("project_id", projectId)
          .order("position", { ascending: true }),
      ),
  });

export const milestonesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["milestones", projectId],
    queryFn: async () => {
      const milestones = unwrap(
        await supabase
          .from("milestones")
          .select("*")
          .eq("project_id", projectId)
          .order("due_at", { ascending: true }),
      );
      const ids = milestones.map((m) => m.id);
      const deliverables = ids.length
        ? unwrap(
            await supabase
              .from("deliverables")
              .select("*")
              .in("milestone_id", ids)
              .order("position", { ascending: true }),
          )
        : [];
      return milestones.map((m) => ({
        ...m,
        deliverables: deliverables.filter((d) => d.milestone_id === m.id),
      }));
    },
  });
