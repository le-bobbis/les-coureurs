// src/app/api/inventory/generate/route.ts
// Dev-only: LLM-generate an item, validate it, then insert or increment directly in the user's inventory.
// No catalog, no slug.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { generateItemFromText } from "@/lib/itemGenerator";
import { ItemDraftSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/dbAdmin";

type Body = { text?: string; profile_id?: string; save?: boolean };

type OkResponse = {
  ok: true;
  draft: { name: string; emoji: string; desc: string; qty: number };
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

    // 1) LLM
    const gen = await generateItemFromText({ userText: body.text });
    if (!gen.ok) return jsonErr(gen.error, undefined, 500);

    // 2) Validate
    const parsed = ItemDraftSchema.safeParse(gen.draft);
    if (!parsed.success) return jsonErr("Invalid item from LLM", parsed.error.format(), 422);
    const draft = parsed.data; // { name, emoji, desc, qty }

    // Normalize to satisfy NOT NULL columns
    const emoji = (draft.emoji ?? "").trim() || "•";
    const descr = (draft.desc ?? "").trim() || `No description provided for ${draft.name}.`;

    // 3) Preview only
    if (!body.save) {
      return NextResponse.json(ok({ draft: { name: draft.name, emoji, desc: descr, qty: draft.qty }, saved: false }), { status: 200 });
    }

    // 4) Saving path
    if (!body.profile_id) return jsonErr("profile_id required when save=true", undefined, 400);

    // Upsert-like behavior within a user: match by (profile_id + ilike(name))
    const { data: rows, error: findErr } = await supabaseAdmin
      .from("inventory")
      .select("id, qty, name")
      .eq("profile_id", body.profile_id)
      .ilike("name", draft.name)
      .limit(1);

    if (findErr) return jsonErr(findErr.message, undefined, 500);

    const existing = (rows as { id: string; qty: number; name: string }[] | null)?.[0];

    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("inventory")
        .update({ qty: (existing.qty ?? 0) + draft.qty })
        .eq("id", existing.id);
      if (updErr) return jsonErr(updErr.message, undefined, 500);

      return NextResponse.json(ok({
        draft: { name: draft.name, emoji, desc: descr, qty: draft.qty },
        saved: true,
        mode: "increment"
      }), { status: 200 });
    }

    // Insert a fresh user-owned item row
    const { error: insErr } = await supabaseAdmin.from("inventory").insert({
      profile_id: body.profile_id,
      name: draft.name,
      emoji,
      descr,
      qty: draft.qty,
      status: "ok",
      meta: {},
    });
    if (insErr) return jsonErr(insErr.message, undefined, 500);

    return NextResponse.json(ok({
      draft: { name: draft.name, emoji, desc: descr, qty: draft.qty },
      saved: true,
      mode: "insert"
    }), { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request body";
    return jsonErr(message, undefined, 400);
  }
}
