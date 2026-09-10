import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  projectId: z.string().uuid(),
  email: z.string().email(),
});

/**
 * Adds an existing account to a project by email address. Only the project
 * owner may do this; the email lookup runs with elevated access so member
 * emails are never exposed to the browser.
 */
export const addMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project || project.owner_id !== userId) {
      return { ok: false as const, reason: "not_owner" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) return { ok: false as const, reason: "no_account" as const };
    if (profile.id === userId) return { ok: false as const, reason: "self" as const };

    const { error: insertError } = await supabase
      .from("project_members")
      .insert({ project_id: data.projectId, user_id: profile.id, role: "member" });
    if (insertError) {
      if (insertError.code === "23505" || insertError.message.includes("duplicate")) {
        return { ok: false as const, reason: "already_member" as const };
      }
      throw new Error(insertError.message);
    }
    return { ok: true as const };
  });
