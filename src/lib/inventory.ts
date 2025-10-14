// TEMP STUB for Phase 6 — replace later with real logic.

export type InventoryItem = {
  id: string;
  name: string;
  qty?: number;
  emoji?: string;
  status?: string;
};

/** List inventory for a session/user/etc. */
export async function listInventory(sessionId?: string): Promise<{
  error: string | null;
  items: InventoryItem[];
}> {
  // explicitly reference to avoid "unused var" warnings
  void sessionId;
  return { error: null, items: [] };
}

/** Add an item (no-op stub) */
export async function addInventoryItem(item?: Partial<InventoryItem>): Promise<{
  error: string | null;
}> {
  void item;
  return { error: null };
}

/** Apply an item use (no-op stub) */
export async function applyItemUse(
  itemId: string,
  opts?: { consume?: boolean; damage?: boolean }
): Promise<{ error: string | null }> {
  void itemId;
  void opts;
  return { error: null };
}
