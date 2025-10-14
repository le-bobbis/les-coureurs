// TEMP STUB for Phase 6 — just to make builds pass during Phase 3.
// Replace with real logic in Phase 6.

export type InventoryItem = {
  id: string;
  name: string;
  qty?: number;
  emoji?: string;
  status?: string;
};

/** List inventory for a session/user/etc. */
export async function listInventory(..._args: unknown[]): Promise<{
  error: string | null;
  items: InventoryItem[];
}> {
  return { error: null, items: [] }; // empty list for now
}

/** Add an item (no-op stub) */
export async function addInventoryItem(..._args: unknown[]): Promise<{
  error: string | null;
}> {
  return { error: null };
}

/** Apply an item use (no-op stub) */
export async function applyItemUse(
  _itemId: string,
  _opts: { consume?: boolean; damage?: boolean }
): Promise<{ error: string | null }> {
  return { error: null };
}
