// src/lib/itemGenerator.ts
// Minimal, swappable LLM client. Server-only.

export type LlmItemDraft = {
  name: string;
  emoji: string;
  desc: string;
  item_slug: string;
  qty: number;
};

export type LlmGenerateParams = {
  userText: string;
};

export type LlmGenerateResult =
  | { ok: true; draft: LlmItemDraft }
  | { ok: false; error: string };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_ITEM_MODEL ?? "gpt-4o-mini";

function buildPrompt(userText: string): string {
  // Keep it short and deterministic-ish. Ask for JSON only.
  return [
    "You are an item-crafter for a grim survival-horror RPG set in early 19th-century Europe.",
    "Generate a single inventory item from the user's request.",
    "",
    "Rules:",
    "- Name is short and diegetic (≤ 3 words).",
    "- Emoji is a recognizable single emoji for quick scanning.",
    "- Desc is 1–2 sentences, grounded and practical.",
    "- item_slug is lowercased, kebab-case, unique-ish.",
    "- qty is a sensible default integer >= 1.",
    "",
    "Output JSON ONLY with keys exactly: name, emoji, desc, item_slug, qty.",
    "",
    `User: ${userText}`,
  ].join("\n");
}

export async function generateItemFromText(params: LlmGenerateParams): Promise<LlmGenerateResult> {
  if (!OPENAI_API_KEY) return { ok: false, error: "Missing OPENAI_API_KEY" };

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: "Return JSON only. No prose." },
      { role: "user", content: buildPrompt(params.userText) },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" as const },
  };

  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", init);
  if (!res.ok) {
    return { ok: false, error: `LLM HTTP ${res.status}` };
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) return { ok: false, error: "Empty LLM response" };

  try {
    const parsed = JSON.parse(content) as LlmItemDraft;
    return { ok: true, draft: parsed };
  } catch {
    return { ok: false, error: "LLM did not return valid JSON" };
  }
}
