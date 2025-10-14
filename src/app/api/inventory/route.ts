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
  const body = await req.json();
  const { data, error } = await addInventoryItem(body);
  return NextResponse.json({ data, error });
}
