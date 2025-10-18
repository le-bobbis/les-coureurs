import type { EngineOutput, GameState } from "@/types";

type UnknownRec = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRec {
  return typeof value === "object" && value !== null;
}

function sanitizeEnv(raw: unknown): GameState["env"] | undefined {
  if (!isObject(raw)) return undefined;
  const env: GameState["env"] = {};
  if (raw.light === "dark" || raw.light === "dim" || raw.light === "normal") {
    env.light = raw.light;
  }
  if (raw.weather === "rain" || raw.weather === "clear") {
    env.weather = raw.weather;
  }
  if (raw.terrain === "mud" || raw.terrain === "rock" || raw.terrain === "road") {
    env.terrain = raw.terrain;
  }
  return Object.keys(env).length ? env : undefined;
}

function sanitizeMission(raw: unknown): GameState["mission"] | undefined {
  if (!isObject(raw)) return undefined;
  const mission: GameState["mission"] = {
    title: typeof raw.title === "string" && raw.title.trim().length ? raw.title : "Unknown",
    brief:
      typeof raw.brief === "string" && raw.brief.trim().length ? raw.brief : null,
    objective:
      typeof raw.objective === "string" && raw.objective.trim().length
        ? raw.objective
        : null,
    mission_prompt:
      typeof raw.mission_prompt === "string" && raw.mission_prompt.trim().length
        ? raw.mission_prompt
        : typeof raw.prompt === "string" && raw.prompt.trim().length
          ? raw.prompt
          : null,
  };
  return mission;
}

function sanitizeInventory(raw: unknown): GameState["inventory"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const inventory = raw
    .map((item) => (isObject(item) ? (item as UnknownRec) : undefined))
    .filter((item): item is UnknownRec => Boolean(item))
    .map((item) => {
      const name = typeof item.name === "string" && item.name.trim().length ? item.name : undefined;
      if (!name) return undefined;
      const sanitized: NonNullable<GameState["inventory"]>[number] = { name };
      if (typeof item.id === "string" && item.id.trim().length) sanitized.id = item.id;
      if (typeof item.emoji === "string" && item.emoji.trim().length) sanitized.emoji = item.emoji;
      if (typeof item.status === "string" && item.status.trim().length) sanitized.status = item.status;
      if (typeof item.qty === "number" && Number.isFinite(item.qty)) sanitized.qty = item.qty;
      return sanitized;
    })
    .filter((item): item is NonNullable<GameState["inventory"]>[number] => Boolean(item));
  return inventory.length ? inventory : undefined;
}

function sanitizeFlags(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const dedup = new Set(
      raw
        .filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0)
        .map((flag) => flag.trim())
    );
    return dedup.size ? Array.from(dedup) : undefined;
  }
  if (isObject(raw)) {
    const dedup = new Set(
      Object.entries(raw)
        .filter(([, val]) => Boolean(val))
        .map(([key]) => key.trim())
        .filter((key) => key.length > 0)
    );
    return dedup.size ? Array.from(dedup) : undefined;
  }
  return undefined;
}

export function normalizeGameState(value: unknown): GameState {
  const raw = isObject(value) ? value : ({} as UnknownRec);

  const env = sanitizeEnv(raw.env);
  const mission = sanitizeMission(raw.mission);
  const inventory = sanitizeInventory(raw.inventory);
  const flags = sanitizeFlags(raw.flags);

  const range = raw.range === "long" || raw.range === "close" ? raw.range : undefined;

  return {
    env,
    range,
    inventory,
    mission,
    flags,
  };
}

export type WorldDelta = EngineOutput["worldDelta"];

export function applyWorldDelta(base: GameState, delta: WorldDelta | null | undefined): GameState {
  if (!delta) {
    return {
      ...base,
      env: base.env ? { ...base.env } : undefined,
      inventory: base.inventory ? base.inventory.map((item) => ({ ...item })) : undefined,
      mission: base.mission ? { ...base.mission } : undefined,
      flags: base.flags ? [...base.flags] : undefined,
    };
  }

  const next: GameState = {
    ...base,
    env: base.env ? { ...base.env } : undefined,
    inventory: base.inventory ? base.inventory.map((item) => ({ ...item })) : undefined,
    mission: base.mission ? { ...base.mission } : undefined,
    flags: base.flags ? [...base.flags] : undefined,
  };

  if (delta.flags?.length) {
    const set = new Set(next.flags ?? []);
    for (const flag of delta.flags) {
      if (typeof flag === "string" && flag.trim().length) {
        set.add(flag.trim());
      }
    }
    next.flags = set.size ? Array.from(set) : undefined;
  }

  if (delta.injury) {
    const injuryFlag = `injury:${delta.injury}`;
    const set = new Set(next.flags ?? []);
    set.add(injuryFlag);
    next.flags = Array.from(set);
  }

  if (delta.inventoryChanges?.length) {
    const existing = next.inventory ? [...next.inventory] : [];

    for (const change of delta.inventoryChanges) {
      if (!change || typeof change.delta !== "number" || !Number.isFinite(change.delta)) continue;

      const id = typeof change.id === "string" && change.id.trim().length ? change.id : undefined;
      const name = typeof change.name === "string" && change.name.trim().length ? change.name : undefined;
      if (!id && !name) continue;

      const finder = (item: NonNullable<GameState["inventory"]>[number]) => {
        if (id && item.id === id) return true;
        if (name && item.name?.toLowerCase() === name.toLowerCase()) return true;
        return false;
      };

      const idx = existing.findIndex(finder);
      if (idx === -1) {
        if (change.delta <= 0 || !name) continue;
        const newItem: NonNullable<GameState["inventory"]>[number] = {
          id,
          name,
          qty: change.delta,
        };
        if (typeof change.status === "string" && change.status.trim().length) {
          newItem.status = change.status;
        }
        existing.push(newItem);
        continue;
      }

      const current = { ...existing[idx] };
      const qty = typeof current.qty === "number" && Number.isFinite(current.qty) ? current.qty : 0;
      const updatedQty = qty + change.delta;
      if (updatedQty <= 0) {
        existing.splice(idx, 1);
        continue;
      }
      current.qty = updatedQty;
      if (typeof change.status === "string" && change.status.trim().length) {
        current.status = change.status;
      }
      existing[idx] = current;
    }

    next.inventory = existing.length ? existing : undefined;
  }

  return next;
}