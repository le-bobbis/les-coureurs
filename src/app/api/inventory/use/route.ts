import { NextResponse } from "next/server";
import { applyItemUse } from "@/lib/inventory";

type Body = {
  itemId?: string;
  consume?: boolean;
  damage?: boolean;
};

export async function POST(req: Request) {
  try {
    const { itemId, consume = false, damage = false } = (await req.json()) as Body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId required" }, { status: 400 });
    }

    const { error } = await applyItemUse(itemId, { consume, damage });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
}
