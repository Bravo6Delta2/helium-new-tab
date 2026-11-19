// What every part of the page shares: the DOM helpers, localStorage, and the live settings.
import { CONFIG } from "./config.js";
import { html } from "./html.js";
import { icon } from "./icons.js";
import { normalizeSettings } from "./settings.js";
import { fmtTime as fmtTimeIn } from "./time.js";

export const $ = (id) => document.getElementById(id);
// Prism's gradient shimmer, from shimmer.js, which speeds up for a moment on emphasize()
export const shimmer = window.startShimmer ? window.startShimmer($("shimmer")) : { emphasize() {} };

// Only touch the DOM when the text changes, so it stays selectable
export const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// Settings, the weather cache and the periods picked are kept in localStorage, which can be
// read before the first paint. Extension storage (see shared.js) has what the worker writes.
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (err) { console.warn(`Couldn't save "${k}":`, err); return false; }
  },
};

export const readSettings = () => normalizeSettings(store.get("settings"), CONFIG);
// The one copy every module reads. main.js saves it, and takes on another tab's.
export const settings = readSettings();

// "15:05", or "3:05 PM", as Settings has it
export const fmtTime = (d, timeZone) => fmtTimeIn(d, timeZone, settings.hour12);

// Chrome's favicon cache, which only extension pages can reach
export const favicon = (url) => globalThis.chrome?.runtime?.id
  ? html`<img class="fav" src="${chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(url) + "&size=32")}" alt="">`
  : html`<span class="fav">${icon("world", 16)}</span>`;
