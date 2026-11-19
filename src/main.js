// The page: starts each part, and tells the parts a settings change concerns.
import { initActivity, renderActivity } from "./activity.js";
import { paintTime, renderClocks, startClock } from "./clock.js";
import { readSettings, settings, store } from "./page.js";
import { initPanels } from "./panels.js";
import { initSearch, updateBangHint } from "./search.js";
import { initSettingsDialog, refreshSettingsDialog } from "./settings-dialog.js";
import { initUblock } from "./ublock.js";
import { buildWeather, initWeather, loadWeather } from "./weather.js";

// Older versions kept the browsing activity cache here, where background.js can't remove
// it when history is deleted, and a second copy of Helium's bangs
try { localStorage.removeItem("activity"); localStorage.removeItem("bangs"); } catch {}

// The clock first, so it's there on the first paint
startClock();
initPanels();
initSearch();
initWeather();

// What each setting changes on the page
function applySettings(kind) {
  if (kind === "weather") { buildWeather(); loadWeather(); }
  else if (kind === "clocks") renderClocks(new Date());
  else if (kind === "hour12") { paintTime(new Date()); loadWeather(); renderActivity(); }
  else if (kind === "fahrenheit") loadWeather();
  else if (kind === "bangs") updateBangHint();
}
initSettingsDialog((kind) => {
  store.set("settings", settings);
  applySettings(kind);
});

// Another tab saved its settings. Taking them on keeps this tab from later saving its
// older copy over them.
window.addEventListener("storage", (e) => {
  if (e.key !== "settings") return;
  const next = readSettings();
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]));
  Object.assign(settings, next);
  for (const kind of changed) applySettings(kind);
  refreshSettingsDialog(changed);
});

// The activity and uBlock pills sit beside the gear, centred together. The dock stays
// hidden until both have their numbers, then shows all at once, so nothing in it moves
// after it appears. A slow history rebuild (first run, daily, after deleting history)
// isn't waited for long.
const DOCK_WAIT = 2000;
const showDock = () => document.querySelector(".dock").classList.add("ready");
Promise.all([initActivity(), initUblock()]).finally(showDock);
setTimeout(showDock, DOCK_WAIT);
