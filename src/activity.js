// Browsing activity, like Vivaldi's: visits per day, the busiest hour, top sites and how
// pages were reached, all from the browser's history. History records visits, not time
// spent on a page.
import { html } from "./html.js";
import { icon } from "./icons.js";
import { bindPanel } from "./panels.js";
import { $, favicon, fmtTime, settings, store } from "./page.js";
import { hostOf } from "./query.js";
import { compact, count, periodDays, periodOr, reportShell } from "./report.js";
import { dayOf, daysAgo, KEEP_DAYS } from "./shared.js";
import { fmtDay, hourLabel } from "./time.js";

// [id, label]. "typed" is the address bar, typing or picking a suggestion. "other" also
// holds redirects, start pages and form posts.
const HOW = [["typed", "Typed"], ["links", "Links"], ["bookmarks", "Bookmarks"], ["other", "Other"]];
const howOf = (transition) =>
  ["typed", "generated", "keyword", "keyword_generated"].includes(transition) ? 0
    : transition === "link" ? 1
    : transition === "auto_bookmark" ? 2
    : 3;
// Deleted history only shows up on a full rebuild, so one happens daily
const ACTIVITY_REBUILD = 24 * 3600_000;
// Days per bar, so each period has 7 to 15 bars. Today has 12 bars of two hours.
const GROUP = { "7d": 1, "30d": 2, "90d": 6 };

const activity = $("activity");
let period = periodOr(store.get("activity:period"), "7d");

// Visits summed per local day, kept in chrome.storage.local as "activity" and topped up
// with what's new since "until":
// { v, built, removed, until, origins: { site: origin }, days: { "YYYY-MM-DD": { n, hours: [24], how: [HOW], sites: { site: n } } } }
// A site is the host and port, without www. "origins" holds an origin actually visited for
// each, like https://www.example.com or http://localhost:8080, for its link. https wins.
// "removed" is the "historyRemoved" stamp it was built after. background.js removes the
// cache whenever history is deleted, even with no new tab open, and a cache built before
// the latest stamp is never used or kept.
const ACTIVITY_VERSION = 3;
let activityData = null, activityLoading = null, activityStale = false;
// A tab coming back tops up at most this often, unless history was deleted meanwhile.
// A cache newer than this is shown as it is, by a new tab too.
const ACTIVITY_TOPUP = 60_000;

// No prototype, so a host like "constructor" or "__proto__" is just a key
const dict = (o) => Object.assign(Object.create(null), o);

const removedStamp = async () => (await chrome.storage.local.get("historyRemoved")).historyRemoved ?? 0;

async function buildActivity() {
  const now = Date.now();
  // Another tab may have just built it, while this one waited for the lock
  let { activity: data, historyRemoved = 0 } = await chrome.storage.local.get(["activity", "historyRemoved"]);
  const reuse = data?.v === ACTIVITY_VERSION && data.removed === historyRemoved && data.built <= now && now - data.built < ACTIVITY_REBUILD;
  if (!reuse) {
    // A millisecond before midnight, as visits at "until" itself were counted last time
    data = { v: ACTIVITY_VERSION, built: now, removed: historyRemoved, until: new Date(daysAgo(KEEP_DAYS - 1) + "T00:00").getTime() - 1, origins: {}, days: {} };
  }
  data.origins = dict(data.origins);
  for (const d of Object.values(data.days)) d.sites = dict(d.sites);
  if (reuse && data.until <= now && now - data.until < ACTIVITY_TOPUP) return data;
  // Every page visited since, then each one's visits. Reloads aren't new visits.
  const pages = await chrome.history.search({ text: "", startTime: data.until, endTime: now, maxResults: 1_000_000 });
  for (let i = 0; i < pages.length; i += 200) {
    const batch = pages.slice(i, i + 200).filter((p) => /^https?:/i.test(p.url));
    const visits = await Promise.all(batch.map((p) => chrome.history.getVisits({ url: p.url })));
    batch.forEach((p, j) => {
      const origin = new URL(p.url).origin, site = hostOf(origin, true);
      if (!data.origins[site]?.startsWith("https:")) data.origins[site] = origin;
      for (const v of visits[j]) {
        if (v.visitTime <= data.until || v.visitTime > now || v.transition === "reload") continue;
        const at = new Date(v.visitTime);
        const d = data.days[dayOf(at)] ??= { n: 0, hours: Array(24).fill(0), how: HOW.map(() => 0), sites: dict() };
        d.n++;
        d.hours[at.getHours()]++;
        d.how[howOf(v.transition)]++;
        d.sites[site] = (d.sites[site] ?? 0) + 1;
      }
    });
  }
  data.until = now;
  const oldest = daysAgo(KEEP_DAYS - 1);
  for (const day in data.days) if (day < oldest) delete data.days[day];
  const seen = new Set(Object.values(data.days).flatMap((d) => Object.keys(d.sites)));
  for (const site in data.origins) if (!seen.has(site)) delete data.origins[site];
  // History deleted while this was counting may be in it. The worker stamps a deletion
  // before removing the cache, so a stamp read after saving also catches one in between.
  if (await removedStamp() === data.removed) {
    try {
      await chrome.storage.local.set({ activity: data });
    } catch (err) {
      // Too big or storage failing: shown anyway, and rebuilt by the next tab
      console.warn(`Couldn't save "activity":`, err);
    }
    if (await removedStamp() === data.removed) return data;
    await chrome.storage.local.remove("activity").catch(() => {});
  }
  return buildActivity();
}

function loadActivity() {
  if (activityLoading) return activityLoading;
  activityStale = false;
  // One tab at a time, so tabs opened together don't each rebuild 90 days of history
  const locked = (fn) => navigator.locks ? navigator.locks.request("activity", fn) : fn();
  activityLoading = locked(buildActivity)
    .then((data) => { activityData = data; renderActivity(); })
    // History is unavailable. The pill stays hidden, and the next tab tries again.
    .catch(() => {})
    .finally(() => { activityLoading = null; });
  return activityLoading;
}

// A load already running may have counted deleted visits, so another one follows it
const reloadActivity = () => (activityLoading ?? Promise.resolve()).then(loadActivity);

const siteUrl = (site) => `${activityData.origins[site] ?? "https://" + site}/`;

export function renderActivity() {
  if (!activityData || document.hidden) return;
  const length = periodDays(period), hour12 = settings.hour12;
  const dayList = Array.from({ length }, (_, i) => daysAgo(length - 1 - i));
  const empty = { n: 0, hours: Array(24).fill(0), how: HOW.map(() => 0), sites: {} };
  const days = dayList.map((day) => activityData.days[day] ?? empty);

  const total = days.reduce((n, d) => n + d.n, 0);
  const hours = Array(24).fill(0), how = HOW.map(() => 0), sites = dict();
  for (const d of days) {
    d.hours.forEach((n, h) => { hours[h] += n; });
    d.how.forEach((n, k) => { how[k] += n; });
    for (const [host, n] of Object.entries(d.sites)) sites[host] = (sites[host] ?? 0) + n;
  }
  const peak = hours.indexOf(Math.max(...hours));
  const top = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Bars of { n, label, now }. Today is all one day, so its hours come straight from it.
  let bars, axis;
  if (length === 1) {
    const hour = new Date().getHours();
    bars = Array.from({ length: 12 }, (_, i) => ({
      n: hours[i * 2] + hours[i * 2 + 1],
      label: `${hourLabel(i * 2, hour12)} – ${hourLabel((i * 2 + 2) % 24, hour12)}`,
      now: i === Math.floor(hour / 2),
    }));
    // Every six hours, under the bar each starts at
    axis = html`<div class="axis hours">${[0, 6, 12, 18].map((h) => html`<span>${hourLabel(h, hour12)}</span>`)}</div>`;
  } else {
    const size = GROUP[period], dayName = (day, i) => i === length - 1 ? "Today" : fmtDay(day);
    bars = Array.from({ length: length / size }, (_, b) => {
      const from = b * size, to = from + size - 1;
      return {
        n: days.slice(from, to + 1).reduce((n, d) => n + d.n, 0),
        label: size === 1
          ? (to === length - 1 ? "Today" : new Date(dayList[to] + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
          : `${dayName(dayList[from], from)} – ${dayName(dayList[to], to)}`,
        now: to === length - 1,
      };
    });
    axis = html`<div class="axis"><span>${fmtDay(dayList[0])}</span><span>Today</span></div>`;
  }
  const most = Math.max(1, ...bars.map((b) => b.n));
  for (const b of bars) b.pct = (b.n / most) * 100;
  activityBars = bars;

  const pill = activity.querySelector(".pill");
  pill.querySelector("strong").textContent = compact.format(total);
  pill.title = length === 1 ? "Pages visited today" : `Pages visited in the last ${length} days`;
  for (const b of activity.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", b.dataset.period === period);
  activity.hidden = false;
  activity.querySelector(".report").innerHTML = html`
    <div class="hero">
      <span class="hero-ic">${icon("activity", 44)}</span>
      <h1 title="${count.format(total)}">${compact.format(total)}</h1>
      <div class="hero-meta">
        <h4>Pages visited</h4>
        <p>${length === 1 ? "Since midnight" : `${count.format(Math.round(total / length))} a day on average`}</p>
      </div>
    </div>
    <div class="chart">${bars.map((b, i) =>
      html`<span class="col${b.now ? " now" : ""}" data-i="${i}"><i style="height:${b.pct}%"></i></span>`)}
      <div class="chart-tip" hidden></div>
    </div>
    ${axis}
    <div class="stats">
      <div class="card">${icon("world")}<div><p>Sites</p><h4>${count.format(Object.keys(sites).length)}</h4></div></div>
      <div class="card">${icon("clock")}<div><p>Busiest hour</p><h4>${total ? hourLabel(peak, hour12) : "–"}</h4></div></div>
    </div>
    <h6 class="section">How you got there</h6>
    <div class="split">${HOW.map(([id], k) => how[k] ? html`<i class="k-${id}" style="flex-grow:${how[k]}"></i>` : "")}</div>
    <ul class="legend two">${HOW.map(([id, name], k) => html`<li><span class="dot k-${id}"></span>${name}<strong>${count.format(how[k])}</strong></li>`)}</ul>
    <h6 class="section">Most visited</h6>
    <ol class="top sites">${top.length ? top.map(([site, n]) => html`<li>
      ${favicon(siteUrl(site))}
      <a class="name" href="${siteUrl(site)}">${site}</a>
      <span class="bar"><i style="width:${(n / top[0][1]) * 100}%"></i></span>
      <span class="n">${count.format(n)}</span>
    </li>`) : html`<li class="muted">No visits yet</li>`}</ol>
    <div class="p-foot"><p>From your browser history</p><p>Updated ${fmtTime(new Date(activityData.until))}</p></div>`;
}

// The pages in the bar under the pointer. A bar's column is its whole height, with no gaps
// between columns, so moving along the chart goes straight from one bar to the next.
let activityBars = [];
function showChartTip(col) {
  const chart = col.parentElement, tip = chart.querySelector(".chart-tip"), bar = activityBars[col.dataset.i];
  chart.querySelector(".col.on")?.classList.remove("on");
  col.classList.add("on");
  tip.innerHTML = html`<strong>${count.format(bar.n)}</strong>${bar.n === 1 ? "page" : "pages"}<span>${bar.label}</span>`;
  tip.hidden = false;
  // Centred over the bar, but kept inside the chart
  const half = tip.offsetWidth / 2, center = col.offsetLeft + col.offsetWidth / 2;
  tip.style.left = `${Math.min(Math.max(center, half), chart.clientWidth - half)}px`;
  tip.style.bottom = `calc(${bar.pct}% + 8px)`;
}

// The first load, for the dock to wait for, or null without history (served as a plain web
// page), when the pill stays hidden
export function initActivity() {
  if (!globalThis.chrome?.history) return null;
  activity.innerHTML = reportShell("Browsing activity", icon("activity"), "visits");
  bindPanel(activity);
  activity.querySelector(".seg").addEventListener("click", (e) => {
    const id = e.target.closest("[data-period]")?.dataset.period;
    if (!id) return;
    period = id;
    store.set("activity:period", id);
    renderActivity();
  });
  activity.addEventListener("pointerover", (e) => {
    const col = e.target.closest(".chart .col");
    if (col && !col.classList.contains("on")) showChartTip(col);
  });
  activity.addEventListener("pointerout", (e) => {
    const chart = e.target.closest(".chart");
    if (!chart || chart.contains(e.relatedTarget)) return;
    chart.querySelector(".col.on")?.classList.remove("on");
    chart.querySelector(".chart-tip").hidden = true;
  });

  // background.js stamps each deletion of history. A tab in the background rebuilds when
  // it's next shown.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.historyRemoved?.newValue) return;
    activityStale = true;
    if (!document.hidden) reloadActivity();
  });
  // Top up when the tab comes back
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // A tab opened in the background skipped rendering until now
    renderActivity();
    if (activityStale) reloadActivity();
    else if (!activityData || Date.now() - activityData.until >= ACTIVITY_TOPUP) loadActivity();
  });
  return loadActivity();
}
