import { NextResponse } from "next/server";
import { useItem } from "lib/inventory";

export async function POST(req: Request) {
  const { itemId, consume, damage } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  const { data, error } = await useItem(itemId, { consume, damage });
  return NextResponse.json({ data, error });
}
