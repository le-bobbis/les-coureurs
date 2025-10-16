// src/app/api/session/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { todayLocal } from "@/lib/today";

export const runtime = "nodejs";

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

function fallbackSeeds(_date: string): SeedRow[] {
  // You can optionally vary by _date later; for now fixed seeds.
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
 * Returns a seed set for a given date (defaults to today).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || todayLocal();
  const seeds = fallbackSeeds(date); // <-- use `date` so ESLint is happy
  return NextResponse.json({ ok: true, date, seeds, route: "seed", method: "GET" });
}

/**
 * POST /api/session
 * Body: { missionId?: string }
 * Creates a session row and returns { sessionId }.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { missionId?: string };
    const missionId = typeof body?.missionId === "string" ? body.missionId : null;

    const { data, error } = await supabaseAdmin
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
