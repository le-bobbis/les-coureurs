// src/app/api/seed-missions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/dbAdmin";
import {
  SeedPayloadSchema,
  type SeedMission,
  type SeedPayload,
  type MissionType,
} from "@/lib/missionSchema";
import { WORLD_CAPSULE } from "@/lib/worldCapsule";

// ---------- limits ----------
const TITLE_MAX = 80;
const BRIEF_MAX = 240;
const OBJECTIVE_MAX = 240;
const OPENING_MAX = 600;
const PROMPT_MAX = 800;

const MODEL_FOR_SEED = "gpt-4o-mini";
const MODEL_FOR_REPAIR = "gpt-4o-mini";

// ---------- small type guards ----------
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// ---------- helpers: normalization & trimming ----------
function normalizeType(t: string | null | undefined): MissionType {
  if (!t) return "Unknown";
  const s = String(t).trim().toLowerCase();
  if (["deliver", "rescue", "recover", "hunt", "escort"].includes(s)) {
    switch (s) {
      case "deliver":
        return "Deliver";
      case "rescue":
        return "Rescue";
      case "recover":
        return "Recover";
      case "hunt":
        return "Hunt";
      case "escort":
        return "Escort";
    }
  }
  return "Unknown";
}

function oneLine(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/\s+/g, " ").trim();
}

function wordSafeTrim(text: string, max: number): string {
  if (text.length <= max) return text.trim();
  const slice = text.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const core = (lastSpace > 0 ? slice.slice(0, lastSpace) : text.slice(0, max)).trim();
  return core.replace(/[,.!?…]$/, "") + "…";
}

function sentenceAwareTrim(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const s = text.trim();
  if (s.length <= max) return s;
  const sentences = s.split(/(?<=[.!?…])\s+/);
  let out = "";
  for (const sentence of sentences) {
    const next = out ? out + " " + sentence : sentence;
    if (next.length <= max) out = next;
    else break;
  }
  if (out.length >= Math.min(40, Math.floor(max * 0.6))) return out;
  return wordSafeTrim(s, max);
}

function bulletBlockTrim(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const s = text.trim();
  if (s.length <= max) return s;
  const bullets = s.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const b of bullets) {
    const joined = kept.length ? kept.join("\n") + "\n" + b : b;
    if (joined.length <= max) kept.push(b);
    else break;
  }
  if (kept.length) return kept.join("\n");
  return wordSafeTrim(s, max);
}

function dropIfTooShort(s: string | null | undefined, min: number): string | null {
  if (!s) return null;
  return s.trim().length < min ? null : s.trim();
}

function sanitizeMission(input: SeedMission): SeedMission {
  const m: SeedMission = { ...input };

  // Single-line player fields, word-safe
  m.title = wordSafeTrim(oneLine(m.title) ?? "", TITLE_MAX);
  m.brief = wordSafeTrim(oneLine(m.brief) ?? "", BRIEF_MAX);

  // Optional single-line; null if too short
  m.objective = dropIfTooShort(oneLine(m.objective ?? undefined), 8);
  if (m.objective) m.objective = wordSafeTrim(m.objective, OBJECTIVE_MAX);

  // GM-facing: allow newlines; trim smartly
  const mp = m.mission_prompt?.replace(/\s+\n/g, "\n").trim();
  m.mission_prompt = mp && mp.length >= 30 ? bulletBlockTrim(mp, PROMPT_MAX) : null;

  const op = m.opening?.replace(/\s+\n/g, "\n").trim();
  m.opening = op && op.length >= 18 ? sentenceAwareTrim(op, OPENING_MAX) : null;

  // Enum normalization
  m.mission_type = normalizeType(m.mission_type);

  return m;
}

// ---------- LLM client ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ---------- health check ----------
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "seed-missions",
    method: "GET",
    now: new Date().toISOString(),
  });
}

// ---------- main generator ----------
export async function POST(req: Request) {
  // Env guards to ensure JSON error responses
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SUPABASE_URL is not set" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }

  try {
    type SeedBody = Partial<{ date: string; useCapsule: boolean; capsule: string }>;
    const body = (await req.json().catch(() => ({}))) as SeedBody;

    // default to today (UTC)
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const date: string = body.date ?? utcDate.toISOString().slice(0, 10);

    // capsule override (optional)
    const capsuleText =
      body.useCapsule && typeof body.capsule === "string" && body.capsule.trim()
        ? body.capsule.trim()
        : WORLD_CAPSULE;

    // ----- SYSTEM -----
    const system = `
You are an expert narrative designer for *Les Coureurs*.
${capsuleText}
`.trim();

    // ----- USER (YOUR EXACT WORDING KEPT) -----
    const user = `
Generate STRICT JSON with keys:
{
  "date": "YYYY-MM-DD",
  "missions": [ { ...slot1 }, { ...slot2 }, { ...slot3 } ]
}

Rules (must follow exactly):
- Exactly 3 missions total; slots must be 1, 2, 3 (unique).
- Lengths: title ≤ 80 chars; brief ≤ 240; objective ≤ 240; opening ≤ 600; mission_prompt ≤ 800.
- Avoid modern slang or anachronistic tech; keep prose concrete and restrained.
- No line breaks inside title/brief/objective. Line breaks allowed in mission_prompt/opening.

For each mission, return these fields:
- slot: 1|2|3
- title (≤80): a short, evocative hook a player sees.
- brief (≤240): the player-facing setup; specify place, pressure, and a dilemma or timer.
- objective (≤240, optional): the simplest clear success condition in-world terms.
- opening (≤600, optional): how the first scene starts; create a sense of place, urgency, and set the player off on their adventure.
- mission_prompt (≤800, optional): GM guidance with 3–6 tight bullets:
    • Location details (terrain, weather, visibility)
    • One faction/figure who cares and why
    • A resource pressure (e.g., powder, salt, lamp oil)
    • One complication that can escalate (clock or trigger)
    • A non-combat way through (barter, stealth, omen)
    • A consequence for failure (material/human)
- mission_type: one of Deliver | Rescue | Recover | Hunt | Escort | Unknown
Date to generate for: ${date}

Return ONLY JSON. No markdown, no commentary.
`.trim();

    // ----- CALL LLM (primary) -----
    const completion = await openai.chat.completions.create({
      model: MODEL_FOR_SEED,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    // ----- PARSE -----
    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM returned non-JSON output." }, { status: 502 });
    }

    // ----- VALIDATE (first pass) -----
    const first = SeedPayloadSchema.safeParse(parsedUnknown);

    const isTooLong = (msg: string) =>
      /Too big|at most|max|must be at most|should be at most/i.test(msg);

    if (!first.success) {
      const longIssues = first.error.issues.filter(
        (i) => typeof i.message === "string" && isTooLong(i.message) && i.path.includes("missions")
      );

      if (longIssues.length && isObject(parsedUnknown)) {
        const missionsUnknown = (parsedUnknown as Record<string, unknown>)["missions"];
        if (isArray(missionsUnknown)) {
          type ToFix = {
            idx: number;
            title?: string;
            brief?: string;
            objective?: string;
            opening?: string;
            mission_prompt?: string;
          };
          const toFix: ToFix[] = [];

          missionsUnknown.forEach((m, idx) => {
            if (!isObject(m)) return;
            const title = isString(m["title"]) ? m["title"] : undefined;
            const brief = isString(m["brief"]) ? m["brief"] : undefined;
            const objective = isString(m["objective"]) ? m["objective"] : undefined;
            const opening = isString(m["opening"]) ? m["opening"] : undefined;
            const missionPrompt = isString(m["mission_prompt"]) ? m["mission_prompt"] : undefined;

            const needsTitle = !!(title && title.length > TITLE_MAX);
            const needsBrief = !!(brief && brief.length > BRIEF_MAX);
            const needsObjective = !!(objective && objective.length > OBJECTIVE_MAX);
            const needsOpening = !!(opening && opening.length > OPENING_MAX);
            const needsPrompt = !!(missionPrompt && missionPrompt.length > PROMPT_MAX);

            if (needsTitle || needsBrief || needsObjective || needsOpening || needsPrompt) {
              const patch: ToFix = { idx };
              if (needsTitle) patch.title = title!;
              if (needsBrief) patch.brief = brief!;
              if (needsObjective) patch.objective = objective!;
              if (needsOpening) patch.opening = opening!;
              if (needsPrompt) patch.mission_prompt = missionPrompt!;
              toFix.push(patch);
            }
          });

          if (toFix.length) {
            // ----- CALL LLM (repair) -----
            const repairUser = `
Shrink the following mission fields to fit the specified character limits WITHOUT losing key details or tone.
Return ONLY JSON: { "missions": [ { "idx": number, "<field>": "revised" }... ] }.
Limits: title ${TITLE_MAX}, brief ${BRIEF_MAX}, objective ${OBJECTIVE_MAX}, opening ${OPENING_MAX}, mission_prompt ${PROMPT_MAX}.

${JSON.stringify(toFix, null, 2)}
`.trim();

            const fix = await openai.chat.completions.create({
              model: MODEL_FOR_REPAIR,
              temperature: 0.3,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: "You edit text to meet character limits while preserving meaning and tone. JSON only." },
                { role: "user", content: repairUser },
              ],
            });

            try {
              const fixRaw = fix.choices[0]?.message?.content ?? "{}";
              const patchJson = JSON.parse(fixRaw) as {
                missions?: Array<
                  { idx: number } & Partial<Record<"title" | "brief" | "objective" | "opening" | "mission_prompt", string>>
                >;
              };

              if (patchJson.missions && isArray(patchJson.missions)) {
                patchJson.missions.forEach((p) => {
                  if (!isObject(p) || typeof p["idx"] !== "number") return;
                  const idx = p["idx"] as number;
                  const m = missionsUnknown[idx];
                  if (!isObject(m)) return;

                  (["title", "brief", "objective", "opening", "mission_prompt"] as const).forEach((key) => {
                    const val = p[key];
                    if (isString(val)) {
                      (m as Record<string, unknown>)[key] = val;
                    }
                  });
                });

                // Re-validate after repair
                const repaired = SeedPayloadSchema.safeParse(parsedUnknown);
                if (!repaired.success) {
                  return NextResponse.json(
                    { error: "Response failed schema validation", issues: repaired.error.issues },
                    { status: 422 }
                  );
                }
                const payload: SeedPayload = repaired.data;
                return await finalizeAndUpsert(payload);
              }
            } catch {
              // If repair JSON invalid, fall through to original error path
            }
          }
        }
      }

      return NextResponse.json(
        { error: "Response failed schema validation", issues: first.error.issues },
        { status: 422 }
      );
    }

    const payload: SeedPayload = first.data;
    return await finalizeAndUpsert(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ----- finalize & upsert helper -----
  async function finalizeAndUpsert(payload: SeedPayload) {
    const missions = payload.missions.slice(0, 3).map(sanitizeMission);

    // ensure slots 1..3 unique
    const seen = new Set<number>();
    for (const m of missions) {
      if (seen.has(m.slot)) {
        return NextResponse.json(
          {
            error: "Slots must be unique 1,2,3",
            issues: [{ path: ["missions", "slot"], message: "Require slots 1,2,3 exactly" }],
          },
          { status: 422 }
        );
      }
      seen.add(m.slot);
    }
    if (![1, 2, 3].every((s) => missions.some((m) => m.slot === s))) {
      return NextResponse.json(
        {
          error: "Slots must be unique 1,2,3",
          issues: [{ path: ["missions", "slot"], message: "Require slots 1,2,3 exactly" }],
        },
        { status: 422 }
      );
    }

    // upsert
    const rows = missions.map((m) => ({
      date: payload.date,
      slot: m.slot,
      title: m.title,
      brief: m.brief,
      objective: m.objective ?? null,
      mission_prompt: m.mission_prompt ?? null,
      opening: m.opening ?? null,
      mission_type: m.mission_type,
    }));

    const { data, error } = await supabaseAdmin
      .from("missions")
      .upsert(rows, { onConflict: "date,slot" })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ date: payload.date, seeded: data }, { status: 200 });
  }
}
