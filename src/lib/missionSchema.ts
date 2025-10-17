// src/lib/missionSchema.ts
import { z } from "zod";

export const MissionTypeEnum = z.enum([
  "Deliver",
  "Rescue",
  "Recover",
  "Hunt",
  "Escort",
  "Unknown",
]);

// ---------- helpers ----------
const isStr = (v: unknown): v is string => typeof v === "string";

const trimPre = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isStr(v) ? v.trim() : v), schema);

// Accept string OR array of strings and return a single newline-bulleted string (or null)
const bulletsToStringPre = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (Array.isArray(v)) {
      const parts = v.filter(isStr).map((s) => s.trim()).filter(Boolean);
      return parts.length ? `• ${parts.join("\n• ")}` : null;
    }
    return isStr(v) ? v.trim() : v;
  }, schema);

// Empty strings → null helper
const emptyToNullPre = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isStr(v) && v.trim().length === 0 ? null : v), schema);

// ---------- mission schema ----------
export const SeedMissionSchema = z.object({
  slot: z.coerce.number().int().min(1).max(3),

  // Player-facing, single line
  title: trimPre(z.string().min(4).max(80)),
  brief: trimPre(z.string().min(10).max(280)),

  // Optional single-line; allow null/empty
  objective: emptyToNullPre(trimPre(z.string().max(240)))
    .nullable()
    .optional(),

  // Optional multi-line; accept string or array of strings; clamp length; allow null/empty
  mission_prompt: bulletsToStringPre(
    emptyToNullPre(z.string().max(800))
  )
    .nullable()
    .optional(),

  // Optional multi-line; allow null/empty
  opening: emptyToNullPre(trimPre(z.string().max(600)))
    .nullable()
    .optional(),

  // We’ll normalize this to the enum in the route (case-insensitive, default "Unknown")
  mission_type: z.string(),
});

export const SeedPayloadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  missions: z.array(SeedMissionSchema).min(3),   // if >3, slice in the route
});

export type SeedMission = z.infer<typeof SeedMissionSchema>;
export type SeedPayload = z.infer<typeof SeedPayloadSchema>;
