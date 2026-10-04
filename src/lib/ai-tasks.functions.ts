import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type DraftTask = {
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  assignee_id: string | null;
  due_date: string | null;
};

export const draftTasksFromChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        channelId: z.string().uuid().nullable(),
        discussion: z.string().max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: members } = await sb.from("project_members").select("user_id, position").eq("project_id", data.projectId);
    if (!members?.some((m) => m.user_id === context.userId)) throw new Error("You are not on this project.");
    const ids = members.map((m) => m.user_id);
    const { data: profiles } = await sb.from("profiles").select("id, username, full_name, discipline").in("id", ids);
    const roster = (profiles ?? [])
      .map((p) => `- id=${p.id} name=${p.username || p.full_name} discipline=${p.discipline} role=${members.find((m) => m.user_id === p.id)?.position ?? ""}`)
      .join("\n");

    let discussion = data.discussion.trim();
    if (data.channelId) {
      const { data: msgs } = await sb
        .from("messages")
        .select("content, user_id, bot, created_at")
        .eq("channel_id", data.channelId)
        .order("created_at", { ascending: false })
        .limit(80);
      const named = (msgs ?? [])
        .reverse()
        .map((m) => {
          const p = profiles?.find((x) => x.id === m.user_id);
          return `${m.bot ?? (p?.username || p?.full_name || "member")}: ${m.content}`;
        })
        .join("\n");
      discussion = [named, discussion].filter(Boolean).join("\n\n");
    }
    if (!discussion) throw new Error("There is no discussion to analyse yet.");

    const { generateTextViaGateway } = await import("./ai-gateway.server");
    const today = new Date().toISOString().slice(0, 10);
    const text = await generateTextViaGateway(
      `You turn team chat discussions into prioritized, actionable Kanban tasks for a multidisciplinary student project. Today is ${today}.
Return ONLY a JSON object: {"tasks":[{"title":string,"description":string,"priority":"low"|"medium"|"high"|"urgent","assignee_id":string|null,"due_date":"YYYY-MM-DD"|null}]}.
Rules: 3-10 tasks, titles start with a verb and stay under 70 characters, descriptions 1-2 sentences with a clear done-criterion, order by priority (most urgent first), assign only using ids from the roster when the discussion or discipline makes ownership clear, otherwise null. Use due dates only when mentioned or implied.
Team roster:
${roster}`,
      `Discussion:\n${discussion.slice(-15000)}`,
    );

    const match = text.match(/\{[\s\S]*\}/);
    let parsed: unknown;
    try {
      parsed = JSON.parse(match?.[0] ?? "");
    } catch {
      throw new Error("The AI reply could not be read — try again.");
    }
    const raw = (parsed as { tasks?: unknown[] })?.tasks ?? [];
    const tasks: DraftTask[] = raw
      .map((t) => t as Record<string, unknown>)
      .filter((t) => typeof t["title"] === "string" && (t["title"] as string).trim())
      .slice(0, 12)
      .map((t) => ({
        title: String(t["title"]).slice(0, 120),
        description: typeof t["description"] === "string" ? t["description"] : "",
        priority: PRIORITIES.includes(t["priority"] as never) ? (t["priority"] as DraftTask["priority"]) : "medium",
        assignee_id: typeof t["assignee_id"] === "string" && ids.includes(t["assignee_id"]) ? t["assignee_id"] : null,
        due_date: typeof t["due_date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t["due_date"]) ? t["due_date"] : null,
      }));
    return { tasks };
  });
