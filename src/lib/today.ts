// src/lib/today.ts
export function todayInTZ(tz: string): string {
  const now = new Date();
  // Render the current time *in that timezone* as ISO-ish, then extract Y-M-D.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year")?.value || "1970";
  const m = parts.find(p => p.type === "month")?.value || "01";
  const d = parts.find(p => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

// Default to LA; override with DAILY_TZ if you want.
export function todayLocal(): string {
  const tz = process.env.DAILY_TZ || "America/Los_Angeles";
  return todayInTZ(tz);
}
