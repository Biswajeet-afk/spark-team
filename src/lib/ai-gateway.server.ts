import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const RUN_ID = "X-Lovable-AIG-Run-ID";
export const CHAT_MODEL = "openai/gpt-6-astra";

/** One-shot text call through Lovable AI (streamed, consumed server-side). */
export async function generateTextViaGateway(system: string, prompt: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this app.");
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID) ?? undefined;
      if (res.status === 429) throw new Error("AI is busy right now — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits are used up for this workspace. Add credits in workspace billing.");
      if (res.status === 403) throw new Error("AI access is blocked for this workspace (limit or policy).");
      return res;
    },
  });
  const result = streamText({
    model: provider.responses(CHAT_MODEL),
    system,
    prompt,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return await result.text;
}
