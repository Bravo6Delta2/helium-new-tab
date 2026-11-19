// The big clock and date, the world clocks in the top corners, and the clock on each
// weather panel, all from one tick a second.
import { esc, html } from "./html.js";
import { $, fmtTime, setText, settings } from "./page.js";
import { offsetLabel, tzOffset } from "./time.js";

export function startClock() {
  const tick = () => {
    const now = new Date();
    // Set first, so a throw while painting can't stop the clock
    setTimeout(tick, 1000 - now.getMilliseconds());
    paintTime(now);
  };
  tick();
}

export function paintTime(now) {
  // AM and PM are set smaller, so the big clock keeps its size
  const time = esc(fmtTime(now)).replace(/\s?([AP]M)$/, '<span class="ampm">$1</span>');
  if ($("time").innerHTML !== time) $("time").innerHTML = time;
  setText($("date"), now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  // A weather panel's clock shows the time in that city
  for (const el of document.querySelectorAll("[data-clock]")) setText(el, fmtTime(now, el.dataset.clock || undefined));
  renderClocks(now);
}

let clocksHtml = "";
export function renderClocks(now) {
  const markup = String(html`${settings.clocks.map((city, i) => city ? html`
    <div class="wc${i ? " end" : ""}">
      <h6>${city.name}</h6>
      <div class="wc-time">${fmtTime(now, city.tz)}</div>
      <p>${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: city.tz })} · ${offsetLabel(tzOffset(city.tz, now))}</p>
    </div>` : "")}`);
  // Only touch the DOM when the minute changes, so text stays selectable
  if (markup !== clocksHtml) $("clocks").innerHTML = clocksHtml = markup;
}
