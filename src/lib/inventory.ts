import { supabaseAdmin } from "lib/db";

export async function listInventory(profileId: string) {
  return supabaseAdmin
    .from("inventory")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
}

export async function addItem(input: InventoryItemInput) {
  const { profileId, name, emoji, descr, itemSlug, qty = 1 } = input;
  // upsert on (profile_id, name, emoji, descr) if you want stackable:
  const { data: existing } = await supabaseAdmin
    .from("inventory")
    .select("*")
    .eq("profile_id", profileId)
    .eq("name", name)
    .eq("emoji", emoji)
    .eq("descr", descr)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return supabaseAdmin
      .from("inventory")
      .update({ qty: existing.qty + qty })
      .eq("id", existing.id)
      .select()
      .single();
  }
  return supabaseAdmin
    .from("inventory")
    .insert([{ profile_id: profileId, name, emoji, descr, item_slug: itemSlug ?? null, qty }])
    .select()
    .single();
}

export async function useItem(itemId: string, options: { consume?: boolean; damage?: boolean } = {}) {
  const { data: item, error } = await supabaseAdmin
    .from("inventory")
    .select("*")
    .eq("id", itemId)
    .single();
  if (error || !item) return { data: null, error };

  if (options.consume) {
    if (item.qty > 1) {
      return supabaseAdmin
        .from("inventory")
        .update({ qty: item.qty - 1 })
        .eq("id", itemId)
        .select()
        .single();
    } else {
      return supabaseAdmin
        .from("inventory")
        .delete()
        .eq("id", itemId)
        .select()
        .maybeSingle();
    }
  }

  if (options.damage) {
    const next =
      item.status === "ok" ? "damaged" :
      item.status === "damaged" ? "broken" : "broken";
    return supabaseAdmin
      .from("inventory")
      .update({ status: next })
      .eq("id", itemId)
      .select()
      .single();
  }

  return { data: item, error: null };
}
