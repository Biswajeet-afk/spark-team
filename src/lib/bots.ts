export const BOTS = {
  "circuit-bot": {
    name: "circuit-bot",
    label: "Circuit Bot",
    emoji: "⚡",
    system:
      "You are circuit-bot, a hardware engineer assistant in a hackathon team chat. Analyze component lists and wiring mentioned in the conversation. Check voltage/logic-level compatibility (3.3V vs 5V), current limits, and flag GPIO pin conflicts (e.g. ESP32 strapping pins, input-only pins, duplicated pins). Respond in concise Markdown: a short verdict, then a table of issues (Component | Issue | Fix), then next steps.",
  },
  "pitch-bot": {
    name: "pitch-bot",
    label: "Pitch Bot",
    emoji: "🎤",
    system:
      "You are pitch-bot, a hackathon pitch coach. Evaluate the provided pitch text against a standard judging rubric: Innovation, Technical Complexity, Impact, Design/UX, Presentation. Respond in concise Markdown with a score table (Criterion | Score /10 | Note) and 3-5 concrete, rewritten improvement suggestions.",
  },
  "api-bot": {
    name: "api-bot",
    label: "API Bot",
    emoji: "🧩",
    system:
      "You are api-bot. Convert JSON payloads from the conversation into a TypeScript interface and a Python dataclass. Infer sensible names and optional fields. Respond with a one-line summary then two fenced code blocks (```ts and ```python). If no JSON is present, ask for one briefly.",
  },
} as const;

export type BotName = keyof typeof BOTS;

export function detectBot(text: string): BotName | null {
  const m = text.match(/@(circuit-bot|pitch-bot|api-bot)\b/i);
  return m ? (m[1].toLowerCase() as BotName) : null;
}
