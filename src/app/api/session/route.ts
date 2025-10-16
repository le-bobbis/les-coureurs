// src/app/api/session/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { todayLocal } from "@/lib/today";

export const runtime = "nodejs";

// ---- Types kept minimal and local to avoid unused warnings ----
type SeedRow = {
  slot: number;
  title: string;
  brief: string;
  objective: string | null;
  mission_prompt: string | null;
  opening: string | null;
};

function sanitizeSeed(m: Partial<SeedRow> | null | undefined, slot: number): SeedRow {
  const title = String(m?.title ?? "").trim().slice(0, 120) || `Mission ${slot}`;
  const briefRaw =
    String(m?.brief ?? m?.mission_prompt ?? "").trim().slice(0, 160) ||
    "A dangerous task awaits in the Brume.";
  const objective = (m?.objective ? String(m.objective) : null)?.trim()?.slice(0, 160) || null;
  const mission_prompt = (m?.mission_prompt ? String(m.mission_prompt) : null)
    ?.trim()
    ?.slice(0, 500) || null;
  const opening = (m?.opening ? String(m.opening) : null)?.trim()?.slice(0, 700) || null;

  return { slot, title, brief: briefRaw, objective, mission_prompt, opening };
}

// Static fallback seeds (kept small + safe)
function fallbackSeeds(date: string): SeedRow[] {
  return [
    sanitizeSeed(
      {
        title: "Sounding the Quarry",
        brief: "Strange bell from the quarry; wardens uneasy.",
        objective: "Identify the bell’s source and the safest approach.",
        opening:
          "Cold mist pools in stepped stone. The bell tolls again—too steady to be wind.",
        mission_prompt:
          "Scout the old quarry at dawn and determine what’s ringing the bell.",
      },
      1
    ),
    sanitizeSeed(
      {
        title: "Missing Cart at Birch Fen",
        brief: "Caravan vanished near the fen trailhead.",
        objective: "Recover supplies; avoid unnecessary attention.",
        opening:
          "Cart ruts end in reed-choked mud. Lantern glass litters the path.",
        mission_prompt:
          "Track the caravan’s last stretch and secure anything recoverable.",
      },
      2
    ),
    sanitizeSeed(
      {
        title: "The Tollhouse Ledger",
        brief: "Rumors of bribed tollkeepers; a ledger may exist.",
        objective: "Acquire the ledger without alerting the keepers.",
        opening:
          "A shutter bangs in the wind. Ink-stained fingers twitch at the sight of coin.",
        mission_prompt:
          "Infiltrate the tollhouse after dusk and locate the ledger.",
      },
      3
    ),
  ];
}

/**
 * GET /api/session
 * Returns a seed set for today (static fallback; easy to extend to LLM later).
 * Query params:
 *   - date?: YYYY-MM-DD (defaults to todayLocal())
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || todayLocal();

  // Right now we just serve static seeds; this keeps build stable.
  const seeds = fallbackSeeds(date);
  return NextResponse.json({ ok: true, date, seeds, route: "seed", method: "GET" });
}

/**
 * POST /api/session
 * Body: { missionId?: string }
 * Creates a session row in Supabase and returns { sessionId }.
 * If Supabase insert fails, returns a 500 with a safe message.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { missionId?: string };
    const missionId = typeof body?.missionId === "string" ? body.missionId : null;

    const sb = supabaseAdmin;

    // Insert a new session; columns are minimal and won't error if you add more later.
    // Assumes your table is named "sessions" and has a default 'id' UUID.
    const { data, error } = await sb
      .from("sessions")
      .insert([{ mission_id: missionId }])
      .select("id")
      .single();

    if (error) {
      console.error("[/api/session] insert failed:", error);
      return NextResponse.json(
        { ok: false, message: "Failed to create session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, sessionId: data?.id ?? null });
  } catch (e) {
    console.error("[/api/session] POST exception:", e);
    return NextResponse.json(
      { ok: false, message: "Unexpected error creating session." },
      { status: 500 }
    );
  }
}
