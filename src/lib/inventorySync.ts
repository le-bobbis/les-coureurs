import { supabase } from '@/lib/db';

export type InventoryItem = {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  qty: number;
  status?: 'ok' | 'damaged';
};

export async function getUserIdClient(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/** Ensure user_inventory row exists; return items array */
export async function loadUserInventory(): Promise<InventoryItem[]> {
  const userId = await getUserIdClient();

  // Try to read existing
  const { data, error } = await supabase
    .from('user_inventory')
    .select('items')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  // If missing, create an empty row
  if (!data) {
    const { error: insErr } = await supabase
      .from('user_inventory')
      .insert({ user_id: userId, items: [] })
      .single();
    if (insErr) throw insErr;
    return [];
  }
  return (data.items ?? []) as InventoryItem[];
}

/** Persist items back to user_inventory (call on save/end) */
export async function saveUserInventory(items: InventoryItem[]) {
  const userId = await getUserIdClient();
  const { error } = await supabase
    .from('user_inventory')
    .update({ items })
    .eq('user_id', userId);
  if (error) throw error;
}
