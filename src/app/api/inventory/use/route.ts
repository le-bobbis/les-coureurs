// src/app/api/inventory/use/route.ts
import { NextResponse } from "next/server";
import { applyItemUse } from "@/lib/inventory";

export async function POST(req: Request) {
  const { itemId, consume, damage } = await req.json();
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }
  const { error } = await applyItemUse(itemId, { consume, damage });
  return NextResponse.json({ error });
}
