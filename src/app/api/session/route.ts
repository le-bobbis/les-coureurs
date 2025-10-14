import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET /api/session
 * Simple ping to verify the route and JSON response.
 */
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST here to create a session" });
}

/**
 * POST /api/session
 * Creates a session row using an existing mission (required by your schema).
 */
export async function POST() {
  try {
    // Accept either service-role env var name; also validate URL is present.
    const urlOk = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceOk =
      !!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.SUPABASE_SERVICE_ROLE;

    if (!urlOk || !serviceOk) {
      return NextResponse.json(
        {
          error:
            "Supabase env vars missing. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE).",
        },
        { status: 500 }
      );
    }

    // Your schema requires mission_id (NOT NULL). Grab any existing mission.
    const { data: mission, error: mErr } = await supabaseAdmin
      .from("missions")
      .select("id")
      .limit(1)
      .single();

    if (mErr || !mission) {
      return NextResponse.json(
        { error: "No missions found. Seed at least one row in 'missions'." },
        { status: 400 }
      );
    }

    // sessions.user_id is NOT NULL. Use a placeholder until Auth (Phase 7).
    const placeholderUserId = "00000000-0000-0000-0000-000000000000";

    const { data, error } = await supabaseAdmin
      .from("sessions")
      .insert([
        {
          user_id: placeholderUserId,
          mission_id: mission.id,
          state: {}, // actions_remaining defaults to 10 per your schema
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("Unhandled /api/session error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
