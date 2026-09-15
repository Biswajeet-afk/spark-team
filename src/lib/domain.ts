import type { Database } from "@/integrations/supabase/types";

export type Discipline = Database["public"]["Enums"]["discipline"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
export type Deliverable = Database["public"]["Tables"]["deliverables"]["Row"];
export type Member = Database["public"]["Tables"]["project_members"]["Row"];
export type MessageAttachment = Database["public"]["Tables"]["message_attachments"]["Row"];
export type MessageReaction = Database["public"]["Tables"]["message_reactions"]["Row"];

export const DISCIPLINES: { value: Discipline; label: string; short: string }[] = [
  { value: "engineering", label: "Engineering", short: "ENG" },
  { value: "design", label: "Design", short: "DES" },
  { value: "business", label: "Business", short: "BIZ" },
  { value: "data", label: "Data / ML", short: "DATA" },
  { value: "research", label: "Research", short: "RES" },
  { value: "other", label: "Other", short: "GEN" },
];

const FALLBACK_DISCIPLINE = { value: "other", label: "Other", short: "GEN" } as const;

export function disciplineMeta(value: Discipline | null | undefined) {
  return DISCIPLINES.find((d) => d.value === value) ?? FALLBACK_DISCIPLINE;
}

export const TASK_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "done", label: "Done" },
];

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function initials(name: string | null | undefined, fallback = "?") {
  const clean = (name ?? "").trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

type NameFields = Partial<Pick<Profile, "username" | "full_name" | "email">>;

/** Public-facing name: the chosen username wins, then real name, then email handle. */
export function displayName(profile: NameFields | null | undefined) {
  if (!profile) return "Unknown member";
  return (
    profile.username?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.split("@")[0] ||
    "Unknown member"
  );
}

/** Real name on file — only shown to the project owner. */
export function realName(profile: NameFields | null | undefined) {
  return profile?.full_name?.trim() || profile?.email || "";
}
