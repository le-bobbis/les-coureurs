// src/lib/inventory.ts
// Minimal stubs to satisfy API routes during early phases.

export type InventoryItem = {
  id: string;
  profile_id?: string;
  item_slug?: string;
  name?: string;
  emoji?: string;
  qty: number;
  status?: string | null;
};

export async function listInventory(_profileId: string): Promise<{
  items: InventoryItem[];
  error: string | null;
}> {
  // Quiet "unused" param warnings without disabling ESLint rules:
  void _profileId;
  return { items: [], error: null };
}

export async function addItem(
  _profileId: string,
  _args: { slug: string; name?: string; emoji?: string; qty?: number }
): Promise<{ error: string | null }> {
  void _profileId;
  void _args;
  return { error: null };
}

export async function useItem(
  _itemId: string,
  _opts: { consume?: boolean; damage?: boolean }
): Promise<{ error: string | null }> {
  void _itemId;
  void _opts;
  return { error: null };
}

// Optional: a clearer name used by /api/inventory/use
export const applyItemUse = useItem;
