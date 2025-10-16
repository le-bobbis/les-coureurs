// src/lib/inventory.ts
// Server-side inventory helpers aligned to your single-table schema (no slug).

import { supabase } from "@/lib/db";

export type InventoryItem = {
  id: string;
  profile_id: string;
  name: string;
  emoji: string;                 // NOT NULL per schema
  descr: string;                 // NOT NULL per schema
  qty: number;                   // NOT NULL, >= 0
  status: "ok" | "damaged" | "destroyed"; // NOT NULL, default 'ok'
  meta: Record<string, unknown>; // jsonb NOT NULL default {}
  created_at: string;            // timestamptz
  updated_at: string;            // timestamptz
};

export type ApplyItemUseOptions = {
  consume?: number;  // How many to consume (e.g., 1 bandage)
  damage?: boolean;  // ok -> damaged -> destroyed
};

export async function listInventory(profileId: string): Promise<{
  items: InventoryItem[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("inventory")
    .select("id, profile_id, name, emoji, descr, qty, status, meta, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("name", { ascending: true });

  return { items: (data as InventoryItem[]) ?? [], error: error?.message ?? null };
}

export async function applyItemUse(
  itemId: string,
  opts: ApplyItemUseOptions
): Promise<{ error: string | null }> {
  const consume = Math.max(0, Math.floor(opts.consume ?? 0));
  const doDamage = !!opts.damage;

  const { data: rows, error: fetchErr } = await supabase
    .from("inventory")
    .select("id, qty, status")
    .eq("id", itemId)
    .limit(1);

  if (fetchErr) return { error: fetchErr.message };
  const row = (rows as { id: string; qty: number; status: InventoryItem["status"] }[] | null)?.[0];
  if (!row) return { error: "Item not found" };

  let nextQty = row.qty;
  if (consume > 0) nextQty = Math.max(0, row.qty - consume);

  let nextStatus: InventoryItem["status"] = row.status ?? "ok";
  if (doDamage) {
    if (nextStatus === "ok") nextStatus = "damaged";
    else if (nextStatus === "damaged") nextStatus = "destroyed";
    else nextStatus = "destroyed";
  }

  if (nextStatus === "destroyed" || nextQty <= 0) {
    const { error: delErr } = await supabase.from("inventory").delete().eq("id", row.id);
    return { error: delErr?.message ?? null };
  }

  const { error: updErr } = await supabase
    .from("inventory")
    .update({ qty: nextQty, status: nextStatus })
    .eq("id", row.id);

  return { error: updErr?.message ?? null };
}

export async function addOrIncrementItem(input: {
  profile_id: string;
  name: string;
  emoji: string;
  descr: string;
  qty?: number;
  meta?: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  const qty = Math.max(1, Math.floor(input.qty ?? 1));

  // Find existing by (profile_id + name), case-insensitive
  const { data: rows, error: findErr } = await supabase
    .from("inventory")
    .select("id, qty, name")
    .eq("profile_id", input.profile_id)
    .ilike("name", input.name)
    .limit(1);

  if (findErr) return { error: findErr.message };

  const existing = (rows as { id: string; qty: number }[] | null)?.[0];
  if (existing) {
    const { error: updErr } = await supabase
      .from("inventory")
      .update({ qty: (existing.qty ?? 0) + qty })
      .eq("id", existing.id);
    return { error: updErr?.message ?? null };
  }

  const { error: insErr } = await supabase.from("inventory").insert({
    profile_id: input.profile_id,
    name: input.name,
    emoji: input.emoji,
    descr: input.descr,
    qty,
    status: "ok",
    meta: input.meta ?? {},
  });

  return { error: insErr?.message ?? null };
}
