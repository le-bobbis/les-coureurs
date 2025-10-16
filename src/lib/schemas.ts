// src/lib/schemas.ts
import { z } from "zod";

export const ItemDraftSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().min(1).max(4),
  desc: z.string().min(1).max(240),
  qty: z.number().int().min(1).max(9999),
});

export type ItemDraft = z.infer<typeof ItemDraftSchema>;
