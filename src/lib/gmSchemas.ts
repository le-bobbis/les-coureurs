// src/lib/gmSchemas.ts
import { z } from "zod";
import { MissionTypeEnum } from "@/lib/missionSchema";

/** Mission payload (subset of your seeded row) the GM needs each turn */
export const GmMissionSchema = z.object({
  title: z.string(),
  brief: z.string(),
  objective: z.string().nullable().optional(),
  opening: z.string().nullable().optional(),
  mission_prompt: z.string().nullable().optional(),
  mission_type: MissionTypeEnum,
});
export type GmMission = z.infer<typeof GmMissionSchema>;

/** Start: first GM call to stage the scene (no player action yet) */
export const GmStartInputSchema = z.object({
  worldCapsule: z.string(),
  mission: GmMissionSchema,
  session: z.object({
    actionsRemaining: z.number().int().min(0).max(10),
    clocks: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          ticks: z.number().int().min(0),
          max: z.number().int().min(1),
        })
      )
      .optional(),
    pressures: z.array(z.enum(["powder", "salt", "oil", "water", "medicine"])).optional(),
    flags: z.record(z.string(), z.boolean()).optional(), // two-arg record
  }),
  player: z.object({
    name: z.string(),
    stats: z.record(z.string(), z.number()).optional(),   // two-arg record
    conditions: z.array(z.string()).optional(),
    inventory: z.array(z.object({ name: z.string(), qty: z.number().int().min(0) })),
  }),
});
export type GmStartInput = z.infer<typeof GmStartInputSchema>;

/** Turn: subsequent GM calls with a player action */
export const GmTurnInputSchema = z.object({
  worldCapsule: z.string(),
  mission: GmMissionSchema,
  session: z.object({
    actionsRemaining: z.number().int().min(0).max(10),
    clocks: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          ticks: z.number().int().min(0),
          max: z.number().int().min(1),
        })
      )
      .optional(),
    pressures: z.array(z.enum(["powder", "salt", "oil", "water", "medicine"])).optional(),
    flags: z.record(z.string(), z.boolean()).optional(),
  }),
  player: z.object({
    name: z.string(),
    stats: z.record(z.string(), z.number()).optional(),
    conditions: z.array(z.string()).optional(),
    inventory: z.array(z.object({ name: z.string(), qty: z.number().int().min(0) })),
  }),
  last: z.object({
    actionText: z.string().nullable(), // null on first turn in unified flows; for /start we won't use this
  }),
});
export type GmTurnInput = z.infer<typeof GmTurnInputSchema>;

/** Minimal, stable output both routes return */
export const GmTurnOutputSchema = z.object({
  narration: z.string().max(900),          // ~150 words
  summary: z.array(z.string()).min(1).max(3),
  actionsRemaining: z.number().int().min(0).max(10),
});
export type GmTurnOutput = z.infer<typeof GmTurnOutputSchema>;
