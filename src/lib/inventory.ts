export type InventoryItem = {
  id: string;
  name: string;
  qty?: number;
  emoji?: string;
  status?: string;
};

export async function listInventory(profileId?: string): Promise<{
  error: string | null;
  data: InventoryItem[];
}> {
  void profileId;
  return { error: null, data: [] };
}

export async function addInventoryItem(item?: Partial<InventoryItem>): Promise<{
  error: string | null;
  data?: InventoryItem;
}> {
  void item;
  return { error: null };
}

export async function applyItemUse(
  itemId: string,
  opts?: { consume?: boolean; damage?: boolean }
): Promise<{ error: string | null }> {
  void itemId;
  void opts;
  return { error: null };
}
