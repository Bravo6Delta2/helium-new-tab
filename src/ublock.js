// The privacy report: what uBlock Origin blocked, as background.js counts it.
import { CONFIG } from "./config.js";
import { html } from "./html.js";
import { icon } from "./icons.js";
import { bindPanel } from "./panels.js";
import { $, store } from "./page.js";
import { compact, count, fmtBytes, fmtDuration, periodDays, periodOr, reportShell } from "./report.js";
import { daysAgo, KEEP_DAYS, KINDS } from "./shared.js";
import { fmtDay } from "./time.js";

const LABELS = { trackers: "Trackers", ads: "Ads", other: "Other" };
const ublock = $("ublock");
let period = periodOr(store.get("ublock:period"), "30d");

function renderUblock({ start, days }) {
  const length = periodDays(period);
  const from = daysAgo(length - 1), to = daysAgo(0);

  // Sum the period, and each company's or domain's share of it. No prototype, so a
  // domain like "constructor" is just a name.
  const sum = { trackers: 0, ads: 0, other: 0 }, sources = Object.create(null);
  for (const [day, d] of Object.entries(days)) {
    // Days after today were counted while the clock was set ahead
    if (day < from || day > to) continue;
    for (const k in sum) sum[k] += d[k];
    // Per kind, in KINDS order
    for (const [name, counts] of Object.entries(d.sources)) {
      const s = sources[name] ??= [0, 0, 0];
      counts.forEach((n, i) => { s[i] += n; });
    }
  }
  const blocked = sum.trackers + sum.ads + sum.other;
  // Each source's total, coloured by what it mostly is
  const top = Object.entries(sources)
    .map(([name, s]) => [name, KINDS[s.indexOf(Math.max(...s))], s[0] + s[1] + s[2]])
    .sort((a, b) => b[2] - a[2])
    .slice(0, 5);

  let note;
  if (length === 1) note = "Since midnight";
  else if (start > from) note = `Counting since ${fmtDay(start)}`;
  else note = `${count.format(Math.round(blocked / length))} a day on average`;

  ublock.hidden = false;
  const pill = ublock.querySelector(".pill");
  pill.querySelector("strong").textContent = compact.format(blocked);
  pill.title = length === 1 ? "Blocked today" : `Blocked in the last ${length} days`;
  for (const b of ublock.querySelectorAll("[data-period]")) b.setAttribute("aria-pressed", b.dataset.period === period);
  ublock.querySelector(".report").innerHTML = html`
    <div class="hero">
      <span class="hero-ic">${icon("shield", 44)}</span>
      <h1 title="${count.format(blocked)}">${compact.format(blocked)}</h1>
      <div class="hero-meta">
        <h4>Requests blocked</h4>
        <p>${note}</p>
      </div>
    </div>
    <div class="split">${KINDS.map((k) => sum[k] ? html`<i class="k-${k}" style="flex-grow:${sum[k]}"></i>` : "")}</div>
    <ul class="legend">${KINDS.map((k) => html`<li><span class="dot k-${k}"></span>${LABELS[k]}<strong>${count.format(sum[k])}</strong></li>`)}</ul>
    <div class="stats">
      <div class="card">${icon("download")}<div><p>Bandwidth saved</p><h4>${fmtBytes(blocked * CONFIG.ublock.bytesPerBlock)}</h4></div></div>
      <div class="card">${icon("hourglass")}<div><p>Time saved</p><h4>${fmtDuration(blocked * CONFIG.ublock.msPerBlock)}</h4></div></div>
    </div>
    <h6 class="section">Most blocked</h6>
    <ol class="top">${top.length ? top.map(([name, kind, n]) => html`<li>
      <span class="dot k-${kind}"></span>
      <span class="name">${name}</span>
      <span class="bar"><i style="width:${(n / top[0][2]) * 100}%"></i></span>
      <span class="n">${count.format(n)}</span>
    </li>`) : html`<li class="muted">Nothing blocked yet</li>`}</ol>
    <div class="p-foot"><a href="https://disconnect.me/trackerprotection">Categories by Disconnect</a><p>Bandwidth and time are estimates</p></div>`;
}

// background.js keeps "start" and a "day:YYYY-MM-DD" key per day, and saves every 5 s
// while pages load. Tabs in the background wait to re-render.
const ublockData = { start: null, days: {} };
const showUblock = () => { if (ublockData.start && !document.hidden) renderUblock(ublockData); };

// The first load, for the dock to wait for, or null without extension storage (served as a
// plain web page), when the pill stays hidden
export function initUblock() {
  if (!globalThis.chrome?.storage) return null;
  ublock.innerHTML = reportShell("Privacy report", icon("shield"), "blocked");
  bindPanel(ublock);
  ublock.querySelector(".seg").addEventListener("click", (e) => {
    const id = e.target.closest("[data-period]")?.dataset.period;
    if (!id) return;
    period = id;
    store.set("ublock:period", id);
    showUblock();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k === "start") ublockData.start = newValue;
      else if (!k.startsWith("day:")) continue;
      else if (newValue) ublockData.days[k.slice(4)] = newValue;
      else delete ublockData.days[k.slice(4)];
      changed = true;
    }
    if (changed) showUblock();
  });
  document.addEventListener("visibilitychange", showUblock);

  const dayKeys = Array.from({ length: KEEP_DAYS }, (_, i) => "day:" + daysAgo(i));
  return chrome.storage.local.get(["start", ...dayKeys]).then((got) => {
    ublockData.start = got.start;
    for (const k of dayKeys) if (got[k]) ublockData.days[k.slice(4)] = got[k];
    showUblock();
  }).catch(() => {});
}
