import { NextResponse } from "next/server";
import { listInventory, addInventoryItem } from "@/lib/inventory";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const { data, error } = await listInventory(profileId);
  return NextResponse.json({ data, error });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const { error } = await addInventoryItem(body);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
