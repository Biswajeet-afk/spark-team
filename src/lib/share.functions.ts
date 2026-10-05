import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public, read-only evaluator snapshot for a valid share token. */
export const getSharedProject = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().regex(/^[a-f0-9]{20,64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { data: link } = await sb.from("share_links").select("project_id").eq("token", data.token).maybeSingle();
    if (!link) return null;
    const pid = link.project_id;
    const [project, tasks, milestones, files, members] = await Promise.all([
      sb.from("projects").select("name, description").eq("id", pid).single(),
      sb.from("tasks").select("id, title, status, priority, due_date").eq("project_id", pid).order("position"),
      sb.from("milestones").select("id, title, description, due_at").eq("project_id", pid).order("due_at"),
      sb.from("message_attachments").select("id, file_name, mime_type, file_size, created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(100),
      sb.from("project_members").select("user_id, position").eq("project_id", pid),
    ]);
    const mIds = (milestones.data ?? []).map((m) => m.id);
    const deliverables = mIds.length
      ? (await sb.from("deliverables").select("milestone_id, title, is_done").in("milestone_id", mIds).order("position")).data ?? []
      : [];
    const uIds = (members.data ?? []).map((m) => m.user_id);
    const profiles = uIds.length ? (await sb.from("profiles").select("id, username, full_name, discipline").in("id", uIds)).data ?? [] : [];
    return {
      project: project.data,
      tasks: tasks.data ?? [],
      milestones: (milestones.data ?? []).map((m) => ({ ...m, deliverables: deliverables.filter((d) => d.milestone_id === m.id) })),
      files: files.data ?? [],
      team: profiles.map((p) => ({
        name: p.username || p.full_name || "Member",
        discipline: p.discipline,
        position: members.data?.find((m) => m.user_id === p.id)?.position ?? null,
      })),
    };
  });
