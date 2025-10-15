export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function GET() {
  // Use UTC "today" to avoid timezone drift
  const todayUTC = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("missions")
    .select("id, date, slot, title, brief, objective")
    .eq("date", todayUTC)
    .order("slot", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date: todayUTC, missions: data ?? [] });
}
