// src/app/api/session/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// GET /api/session/:id
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const id = ctx?.params?.id;

  try {
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing session id" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin;

    const { data: session, error: sErr } = await sb
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (sErr) throw sErr;

    const { data: turns, error: tErr } = await sb
      .from("turns")
      .select("*")
      .eq("session_id", id)
      .order("idx", { ascending: true });

    if (tErr) throw tErr;

    return NextResponse.json({ ok: true, session, turns: turns ?? [] });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: 500 }
    );
  }
}
