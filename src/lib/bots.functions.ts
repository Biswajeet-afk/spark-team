import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BOTS, type BotName } from "./bots";

export const askBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        channelId: z.string().uuid(),
        bot: z.enum(["circuit-bot", "pitch-bot", "api-bot"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const bot = BOTS[data.bot as BotName];
    const { data: recent, error } = await context.supabase
      .from("messages")
      .select("content, bot, created_at")
      .eq("channel_id", data.channelId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error("Could not read the channel.");
    const transcript = (recent ?? [])
      .reverse()
      .map((m) => `${m.bot ? `[${m.bot}]` : "[member]"}: ${m.content}`)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: bot.system },
          { role: "user", content: `Recent channel conversation (latest last; the last mention of @${bot.name} is the request):\n\n${transcript}` },
        ],
      }),
    });
    if (res.status === 429) throw new Error("The bot is busy — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are used up for this workspace.");
    if (!res.ok) throw new Error("The bot could not answer right now.");
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = json.choices?.[0]?.message?.content?.trim() || "_No answer._";

    const insert = await context.supabase
      .from("messages")
      .insert({ channel_id: data.channelId, user_id: context.userId, content: reply, bot: bot.name });
    if (insert.error) throw new Error("Could not post the bot reply.");
    return { ok: true };
  });
