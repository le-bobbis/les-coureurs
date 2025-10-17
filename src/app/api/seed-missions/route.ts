// src/app/api/seed-missions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/dbAdmin";
import { SeedPayloadSchema, MissionTypeEnum } from "@/lib/missionSchema";
import { WORLD_CAPSULE } from "@/lib/worldCapsule";

// ---------- helpers ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function normalizeType(t: string | null | undefined) {
  if (!t) return "Unknown";
  const s = String(t).trim();
  const parsed = MissionTypeEnum.safeParse(s);
  return parsed.success ? parsed.data : "Unknown";
}
function oneLine(s: string | null | undefined) {
  if (!s) return null;
  return s.replace(/\s+/g, " ").trim();
}
function clamp(s: string | null | undefined, max: number) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trim() : s.trim();
}
function dropIfTooShort(s: string | null | undefined, min: number) {
  if (!s) return null;
  return s.trim().length < min ? null : s.trim();
}
function sanitizeMission(m: any) {
  // Player-facing: single line
  m.title = clamp(oneLine(m.title), 80);
  m.brief = clamp(oneLine(m.brief), 240);
  // Optional, single-line; null if too short
  m.objective = dropIfTooShort(oneLine(m.objective), 8);
  // GM-facing: allow newlines; clamp; null if too short
  m.mission_prompt = dropIfTooShort(clamp(m.mission_prompt?.replace(/\s+\n/g, "\n"), 800), 30);
  m.opening = dropIfTooShort(clamp(m.opening?.replace(/\s+\n/g, "\n"), 600), 18);
  // Enum
  m.mission_type = normalizeType(m.mission_type);
  return m;
}

// ---------- health check ----------
export async function GET() {
  return NextResponse.json({ ok: true, route: "seed-missions", method: "GET", now: new Date().toISOString() });
}

// ---------- main generator ----------
export async function POST(req: Request) {
  // Env guards so we always return JSON (not an HTML error page)
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
    const body = await req.json().catch(() => ({} as any));

    // Default to today (UTC)
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const date: string = body?.date ?? utcDate.toISOString().slice(0, 10);

    // Optional: allow overriding/turning off the capsule from the client
    const capsuleText =
      body?.useCapsule && typeof body?.capsule === "string" && body.capsule.trim()
        ? body.capsule.trim()
        : WORLD_CAPSULE;

    // ----- SYSTEM -----
    const system = `
You are an expert narrative designer for *Les Coureurs*.
${capsuleText}
`.trim();

    // ----- USER -----
    // Keep all format/schema rules here (not in the capsule)
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

    // ----- CALL LLM -----
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    // ----- PARSE & VALIDATE -----
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM returned non-JSON output." }, { status: 502 });
    }

    const safe = SeedPayloadSchema.safeParse(parsed);
    if (!safe.success) {
      console.error("Seed validation issues:", safe.error.issues);
      return NextResponse.json(
        { error: "Response failed schema validation", issues: safe.error.issues },
        { status: 422 }
      );
    }

    const payload = safe.data;

    // Defensive normalization & duplicate-slot check
    const seen = new Set<number>();
    for (const m of payload.missions) {
      sanitizeMission(m);
      if (seen.has(m.slot)) {
        return NextResponse.json({ error: `Duplicate slot ${m.slot} detected.` }, { status: 422 });
      }
      seen.add(m.slot);
    }

    // ----- UPSERT (date,slot) -----
    const rows = payload.missions.map((m) => ({
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
