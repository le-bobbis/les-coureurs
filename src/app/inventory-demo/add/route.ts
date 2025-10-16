// src/app/api/inventory/add/route.ts
// Dev-only helper to add or increment an item directly (no LLM, no slug).

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dbAdmin";

type Body = {
  profile_id?: string;
  name?: string;
  emoji?: string;     // REQUIRED by schema
  descr?: string;     // REQUIRED by schema
  qty?: number;       // default 1
  meta?: Record<string, unknown>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body.profile_id || !body.name || !body.emoji || !body.descr) {
      return NextResponse.json(
        { error: "profile_id, name, emoji, descr are required" },
        { status: 400 }
      );
    }

    const qty = Math.max(1, Math.floor(body.qty ?? 1));

    // Upsert within the user's inventory by case-insensitive name
    const { data: rows, error: findErr } = await supabaseAdmin
      .from("inventory")
      .select("id, qty, name")
      .eq("profile_id", body.profile_id)
      .ilike("name", body.name)
      .limit(1);

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

    const existing = (rows as { id: string; qty: number }[] | null)?.[0];

    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("inventory")
        .update({ qty: (existing.qty ?? 0) + qty })
        .eq("id", existing.id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ error: null, mode: "increment" });
    }

    const { error: insErr } = await supabaseAdmin.from("inventory").insert({
      profile_id: body.profile_id,
      name: body.name,
      emoji: body.emoji,
      descr: body.descr,
      qty,
      status: "ok",
      meta: body.meta ?? {},
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ error: null, mode: "insert" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST", hint: "POST /api/inventory/add" }, { status: 405 });
}
