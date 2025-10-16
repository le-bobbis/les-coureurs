// src/app/api/inventory/generate/route.ts
// Dev-only: generate an item draft with LLM, validate, then optionally save.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { generateItemFromText } from "@/lib/itemGenerator";
import { ItemDraftSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/dbAdmin";

type Body = { text?: string; profile_id?: string; save?: boolean };

type OkResponse = {
  ok: true;
  draft: { name: string; emoji: string; desc: string; item_slug: string; qty: number };
  saved: boolean;
  mode?: "insert" | "increment";
  error: null;
};

type ErrResponse = { ok: false; error: string; details?: unknown };

function ok(res: Omit<OkResponse, "ok" | "error">): OkResponse {
  return { ok: true, error: null, ...res };
}
function jsonErr(error: string, details?: unknown, status = 400) {
  const body: ErrResponse = { ok: false, error, ...(details ? { details } : {}) };
  return NextResponse.json(body, { status });
}

export async function GET() {
  return jsonErr("Use POST /api/inventory/generate", undefined, 405);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.text) return jsonErr("text required", undefined, 400);

    const gen = await generateItemFromText({ userText: body.text });
    if (!gen.ok) return jsonErr(gen.error, undefined, 500);

    const safe = ItemDraftSchema.safeParse(gen.draft);
    if (!safe.success) return jsonErr("Invalid item from LLM", safe.error.format(), 422);
    const draft = safe.data; // { name, emoji, desc, item_slug, qty }

    // Preview only
    if (!body.save) return NextResponse.json(ok({ draft, saved: false }), { status: 200 });

    if (!body.profile_id) return jsonErr("profile_id required when save=true", undefined, 400);

    // Upsert-like behavior using service role (dev)
    let query = supabaseAdmin
      .from("inventory")
      .select("id, qty")
      .eq("profile_id", body.profile_id)
      .limit(1);

    if (draft.item_slug) query = query.eq("item_slug", draft.item_slug);
    else query = query.eq("name", draft.name);

    const { data: rows, error: findErr } = await query;
    if (findErr) return jsonErr(findErr.message, undefined, 500);

    const existing = (rows as { id: string; qty: number }[] | null)?.[0];
    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("inventory")
        .update({ qty: (existing.qty ?? 0) + draft.qty })
        .eq("id", existing.id);
      if (updErr) return jsonErr(updErr.message, undefined, 500);
      return NextResponse.json(ok({ draft, saved: true, mode: "increment" }), { status: 200 });
    }

    const { error: insErr } = await supabaseAdmin.from("inventory").insert({
      profile_id: body.profile_id,
      item_slug: draft.item_slug,
      name: draft.name,
      emoji: draft.emoji,  // REQUIRED by schema
      descr: draft.desc,   // REQUIRED by schema
      qty: draft.qty,
      status: "ok",        // REQUIRED by schema (non-null)
      meta: {},            // REQUIRED by schema (jsonb not null)
    });
    if (insErr) return jsonErr(insErr.message, undefined, 500);

    return NextResponse.json(ok({ draft, saved: true, mode: "insert" }), { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request body";
    return jsonErr(message, undefined, 400);
  }
}
