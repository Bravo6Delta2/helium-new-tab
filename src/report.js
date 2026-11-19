// What the dock's reports (uBlock Origin stats and browsing activity) share. No DOM here,
// so the tests can run it.
import { html } from "./html.js";

// [id, label, days]. Both keep 90 days, the last period: background.js its KEEP_DAYS
// (shared.js), and activity.js its ACTIVITY_DAYS.
export const PERIODS = [["today", "Today", 1], ["7d", "7D", 7], ["30d", "30D", 30], ["90d", "90D", 90]];
export const periodDays = (id) => PERIODS.find(([p]) => p === id)[2];
// A saved period, or the default when it's missing or unknown
export const periodOr = (saved, fallback) => PERIODS.find(([id]) => id === saved)?.[0] ?? fallback;

export const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const count = new Intl.NumberFormat("en-US");

export function fmtBytes(b) {
  const units = ["KB", "MB", "GB", "TB"];
  let i = 0;
  for (b /= 1000; b >= 1000 && i < units.length - 1; i++) b /= 1000;
  return `${b < 10 ? b.toFixed(2) : b < 100 ? b.toFixed(1) : Math.round(b)} ${units[i]}`;
}
export function fmtDuration(ms) {
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(min < 600 ? 1 : 0)} h`;
}

// A report's panel and pill, filled in by its render
export const reportShell = (title, iconSvg, unit) => html`
  <div class="panel">
    <div class="p-head"><h5>${title}</h5><div class="seg" role="group" aria-label="Period">
      ${PERIODS.map(([id, label]) => html`<button type="button" data-period="${id}">${label}</button>`)}
    </div></div>
    <div class="report"></div>
  </div>
  <button class="button pill" type="button" aria-expanded="false">${iconSvg}<strong></strong>${unit}</button>`;
