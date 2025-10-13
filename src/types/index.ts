export type InventoryItemInput = {
  profileId: string;
  name: string;      // "Rope"
  emoji: string;     // "🪢"
  descr: string;     // "Coarse hemp rope, 10m"
  itemSlug?: string; // optional, if using catalog
  qty?: number;      // default 1
};
