// Times and time zones. No DOM or settings here, so the tests can run it.

// A zone the browser doesn't know makes every date function given it throw
export const validTz = (tz) => {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};

// "15:05", or "3:05 PM"
export const fmtTime = (d, timeZone, hour12) => d.toLocaleTimeString(hour12 ? "en-US" : "en-GB",
  { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12, timeZone });

// Minutes the zone is ahead of UTC at d, from its wall clock read back as UTC
const wallClocks = new Map(); // zone -> its formatter, as the clocks ask every second
export function utcOffset(tz, d) {
  let fmt = wallClocks.get(tz);
  if (!fmt) wallClocks.set(tz, fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }));
  const parts = {};
  for (const { type, value } of fmt.formatToParts(d)) parts[type] = Number(value);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wall - Math.floor(d / 1000) * 1000) / 60_000);
}
// Minutes the zone is ahead of local time
export const tzOffset = (tz, d) => utcOffset(tz, d) + d.getTimezoneOffset();
export function offsetLabel(min) {
  if (!min) return "Same time";
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "−"}${Math.floor(a / 60)}h${a % 60 ? ` ${a % 60}m` : ""}`;
}

// Open-Meteo gives times as the city's wall clock, "2026-11-17T06:52"
export const clockOf = (iso, hour12) => {
  if (typeof iso !== "string") return "–";
  const h = Number(iso.slice(11, 13)), m = iso.slice(14, 16);
  return hour12 ? `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}` : iso.slice(11, 16);
};
// The same, with the day when it isn't today: "Mon, Nov 16, 22:00"
export const whenOf = (iso, today, hour12) => typeof iso === "string" && iso.slice(0, 10) !== today
  ? `${new Date(iso.slice(0, 10) + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${clockOf(iso, hour12)}`
  : clockOf(iso, hour12);

// "9 AM", or "09:00"
export const hourLabel = (h, hour12) => hour12 ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : `${String(h).padStart(2, "0")}:00`;
// "Nov 16"
export const fmtDay = (day) => new Date(day + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
