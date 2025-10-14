// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { listInventory } from "@/lib/inventory";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  const { items, error } = await listInventory(profileId);
  return NextResponse.json({ items, error });
}
