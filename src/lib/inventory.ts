// src/lib/inventory.ts
export type InventoryItem = {
  id: string;
  profile_id: string;
  item_slug: string;
  name?: string | null;
  emoji?: string | null;
  qty: number;
  status?: string | null;
};

export async function listInventory(_profileId: string): Promise<{
  error: string | null;
  items: InventoryItem[];
}> {
  return { error: null, items: [] };
}

export async function applyItemUse(
  _itemId: string,
  _opts: { consume?: boolean; damage?: boolean }
): Promise<{ error: string | null }> {
  return { error: null };
}
