import { test, expect } from "vitest";
import { resolveTurn } from "./rules";

const base = {
  sessionId: "sess-A",
  turnIndex: 0,
  playerInput: "climb the wall with rope",
  stats: { STR:6, PER:5, PRC:5, VIT:5, INT:5, CHA:5, MEN:5, RFX:5, LCK:6 },
  state: { env: { light: "dim" }, inventory: [{ name: "rope" }] },
  actionsRemaining: 10,
};

test("deterministic by (sessionId, turnIndex)", () => {
  const a = resolveTurn(base);
  const b = resolveTurn(base);
  expect(a.debug.rolls[0]).toBe(b.debug.rolls[0]);
  expect(a.actionsRemaining).toBe(9);
});

test("situational modifiers affect DC/parts", () => {
  const dark = resolveTurn({ ...base, state: { env: { light: "dark" } } });
  const dim  = resolveTurn({ ...base, state: { light: undefined, env: { light: "dim" } } });
  expect(dark.debug.checks[0].dc).toBeGreaterThanOrEqual(dim.debug.checks[0].dc);
});
