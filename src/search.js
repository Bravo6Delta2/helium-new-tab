// The search box: bangs, suggestions, and going where what's typed says.
import { CONFIG } from "./config.js";
import { html } from "./html.js";
import { icon } from "./icons.js";
import { $, favicon, settings, shimmer } from "./page.js";
import { closePanels } from "./panels.js";
import { findBang, isSearchPage, matchBangs, ownBangEntry, parseBangList, resolve } from "./query.js";
import { allEngines, defaultEngine } from "./settings.js";
import { hostOf, prettyUrl, reEscape } from "./url.js";

const q = $("q"), suggest = $("suggest");

/* ---------- bangs ---------- */
// Helium's list is Kagi's bangs plus Helium's extras. "f" holds Kagi's format flags.
// Helium keeps its copy in memory only, so the page can't borrow it. Instead the list is
// left to the browser's HTTP cache (the server allows a day, then revalidates by ETag),
// and only fetched once a bang is typed.
let heliumBangs = null; // Map of trigger -> { s: name, ts: [trigger], u: url template, f: flags }
let heliumBangList = []; // The same bangs in a list, for suggestions
let bangsLoading = null, bangsFailedAt = 0;
const BANGS_RETRY = 30_000;

function loadHeliumBangs() {
  // Offline, every keystroke would ask again. Wait a little between tries.
  if (!bangsLoading && Date.now() - bangsFailedAt < BANGS_RETRY) return Promise.resolve();
  bangsLoading ??= (async () => {
    try {
      const res = await fetch(CONFIG.search.bangList);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const list = parseBangList(await res.text()), map = new Map();
      for (const b of list) for (const t of b.ts) map.set(t, b);
      heliumBangs = map;
      heliumBangList = list;
      updateBangHint();
      if (document.activeElement === q) updateSuggestions();
    } catch {
      // Unknown bangs still work through DuckDuckGo. Try again on a later bang.
      bangsLoading = null;
      bangsFailedAt = Date.now();
    }
  })();
  return bangsLoading;
}

// Your bangs as [trigger, name, url template]: Settings' before CONFIG's, so the first of a
// trigger is the one used. Own properties only, so "!constructor" isn't Object's.
const ownBangs = () => [...settings.bangs.map((b) => [b.t, b.name, b.url]), ...Object.entries(CONFIG.bangs).map(([t, [s, u]]) => [t, s, u])];
// [name, url template]
const ownBang = (key) => ownBangs().find(([t]) => t === key)?.slice(1) ?? null;

function lookupBang(key) {
  const own = ownBang(key);
  return own ? ownBangEntry(own) : heliumBangs?.get(key) || null;
}

const resolveText = (text) => resolve(text, {
  lookup: lookupBang,
  search: allEngines(settings, CONFIG)[settings.engine] ?? CONFIG.search.engines[defaultEngine(CONFIG)],
  unknownBang: CONFIG.search.unknownBang,
});

export function updateBangHint() {
  const bang = findBang(q.value);
  if (bang && !heliumBangs) loadHeliumBangs();
  let label = "";
  if (bang?.key) label = lookupBang(bang.key)?.s ?? (heliumBangs ? `!${bang.key} via DuckDuckGo` : "");
  $("bang-chip").textContent = label;
  $("search-icon").innerHTML = icon(bang?.key ? "bang" : "search");
}

/* ---------- going somewhere ---------- */
function go(url, newTab) {
  shimmer.emphasize();
  // A page can't open chrome:// and the like itself, but the tabs API can
  if (!/^https?:/i.test(url) && globalThis.chrome?.tabs) {
    if (newTab) chrome.tabs.create({ url });
    else chrome.tabs.update({ url });
  } else if (newTab) window.open(url, "_blank");
  else location.href = url;
}

// Like the address bar's "Switch to tab". This new tab closes, unless it has been used to
// go somewhere and has a back button to keep.
async function switchTab(tab) {
  let t;
  try {
    // Closed, or gone somewhere else, since it was suggested: the page opens here instead
    const live = await chrome.tabs.get(tab.id);
    if ((live.pendingUrl || live.url) !== tab.url) throw 0;
    t = await chrome.tabs.update(tab.id, { active: true });
  } catch {
    return go(tab.url);
  }
  // Its window now, as it may have been moved to another since
  await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
  if (history.length <= 1) chrome.tabs.getCurrent().then((t) => t && chrome.tabs.remove(t.id)).catch(() => {});
}

/* ---------- suggestions ---------- */
// Bangs while one is being typed, otherwise open tabs and pages from history and bookmarks.
// Nothing is picked until an arrow key says so, so Enter still searches what was typed.
const SUGGEST_MAX = 6;
let rows = [], rowsFor = "", active = -1, suggestSeq = 0;

// The "!yt" the caret is in, if any
function caretBang() {
  const end = q.value.slice(q.selectionStart).match(/^\S*/)[0].length + q.selectionStart;
  const m = q.value.slice(0, end).match(/(?:^|\s)!(\S+)$/);
  return m ? { prefix: m[1].toLowerCase(), start: end - m[1].length - 1, end } : null;
}

// Tabs in every window but this one, leaving out other new tabs and incognito ones
async function openTabs() {
  const [tabs, self] = await Promise.all([chrome.tabs.query({}), chrome.tabs.getCurrent()]);
  return tabs.filter((t) => t.id !== self?.id && !t.incognito && t.url && !/^chrome:\/\/new-?tab\b/i.test(t.url));
}

async function matchPages(text) {
  const [visits, marks, tabs] = await Promise.all([
    chrome.history.search({ text, startTime: 0, maxResults: 100 }),
    chrome.bookmarks ? chrome.bookmarks.search(text).catch(() => []) : [],
    openTabs().catch(() => []),
  ]);
  const words = text.toLowerCase().split(/\s+/);
  const byUrl = new Map();
  for (const h of visits) byUrl.set(h.url, { url: h.url, title: h.title, weight: h.typedCount * 3 + h.visitCount });
  for (const b of marks) {
    if (!b.url) continue; // a folder
    const page = byUrl.get(b.url) ?? { url: b.url, weight: 0 };
    byUrl.set(b.url, { ...page, title: b.title || page.title, bookmark: true });
  }
  // A page that's open switches to its tab. Tabs with every typed word in their title or
  // address are added, as history may not have them (yet).
  for (const t of tabs) {
    const page = byUrl.get(t.url);
    if (page) page.tab ??= t;
    else if (words.every((w) => `${t.title} ${t.url}`.toLowerCase().includes(w))) {
      byUrl.set(t.url, { url: t.url, title: t.title, weight: 0, tab: t });
    }
  }
  // Pages whose site starts with what was typed first, then a word in the title.
  // Within each, open tabs, then bookmarks, then the most visited.
  const first = words[0];
  const word = new RegExp("(^|\\W)" + reEscape(first), "i");
  const tier = (p) => hostOf(p.url).startsWith(first) ? 0 : word.test(p.title) ? 1 : 2;
  const engines = Object.values(allEngines(settings, CONFIG));
  return [...byUrl.values()]
    .filter((p) => !/^(javascript|chrome-extension):/i.test(p.url) && !isSearchPage(p.url, engines))
    .map((p) => ({ ...p, tier: tier(p) }))
    .sort((a, b) => a.tier - b.tier || !!b.tab - !!a.tab || (b.bookmark ?? 0) - (a.bookmark ?? 0) || b.weight - a.weight)
    .slice(0, SUGGEST_MAX);
}

async function updateSuggestions() {
  const seq = ++suggestSeq, value = q.value;
  const text = value.trim(), token = caretBang();
  let next = [];
  if (token) next = matchBangs(token.prefix, ownBangs(), heliumBangList, SUGGEST_MAX);
  // Served as a plain web page there's no history to search
  else if (text && !findBang(text) && globalThis.chrome?.history) next = await matchPages(text).catch(() => []);
  // A newer keystroke may have finished first
  if (seq !== suggestSeq || document.activeElement !== q) return;
  rows = next;
  rowsFor = value;
  active = -1;
  paintSuggestions();
}

function closeSuggestions() {
  suggestSeq++;
  rows = [];
  active = -1;
  paintSuggestions();
}

// Text with the typed words in bold
function mark(text, words) {
  words = words.filter(Boolean);
  if (!words.length) return text;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(words.map(reEscape).join("|"), "gi"))) {
    parts.push(text.slice(last, m.index), html`<b>${m[0]}</b>`);
    last = m.index + m[0].length;
  }
  return [...parts, text.slice(last)];
}

function paintSuggestions() {
  const words = rows[0]?.bang ? [] : q.value.trim().split(/\s+/);
  suggest.innerHTML = html`${rows.map((r, i) => html`
    <li role="option" id="sg-${i}" data-i="${i}" class="${i === active ? "active" : ""}" aria-selected="${i === active}">
      ${favicon(r.url)}
      <span class="txt"><span class="title">${mark(r.title || prettyUrl(r.url), words)}</span><small>${r.bang ? hostOf(r.url) : prettyUrl(r.url)}</small></span>
      ${r.bang ? html`<span class="tag">!${r.bang}</span>` : r.tab ? html`<span class="tag">Switch to tab</span>`
        : r.bookmark ? html`<span class="mark" title="Bookmark">${icon("bookmark", 16)}</span>` : ""}
    </li>`)}`;
  q.setAttribute("aria-expanded", rows.length > 0);
  if (rows.length) closePanels();
  if (rows[active]) q.setAttribute("aria-activedescendant", "sg-" + active);
  else q.removeAttribute("aria-activedescendant");
}

// ⌘ or Ctrl opens an open tab's page again in a new one, instead of switching to it
function pick(row, newTab) {
  if (row.tab && !newTab) return switchTab(row.tab);
  if (!row.bang) return go(row.url, newTab);
  // Swap the half-typed bang for the whole one, ready for the search terms
  const token = caretBang();
  if (!token) return;
  const before = q.value.slice(0, token.start), after = q.value.slice(token.end).trimStart();
  q.value = `${before}!${row.bang} ${after}`;
  const caret = before.length + row.bang.length + 2;
  q.setSelectionRange(caret, caret);
  updateBangHint();
  updateSuggestions();
}

/* ---------- the box ---------- */
export function initSearch() {
  $("search-icon").innerHTML = icon("search");

  q.addEventListener("input", () => {
    // The rows on screen are for the old text until the new ones arrive, so Enter searches
    if (active !== -1) { active = -1; paintSuggestions(); }
    updateBangHint();
    updateSuggestions();
  });

  q.addEventListener("keydown", async (e) => {
    // Enter and the arrows belong to the IME while it's composing
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
      e.preventDefault();
      // Not into rows still showing for what was typed before, which are about to change
      if (rowsFor !== q.value) return;
      // -1 is the text as typed, between the last row and the first
      const n = rows.length + 1;
      active = ((active + 1 + (e.key === "ArrowDown" ? 1 : -1) + n) % n) - 1;
      paintSuggestions();
    } else if (e.key === "Tab" && !e.shiftKey && rows[0]?.bang) {
      e.preventDefault();
      pick(rows[Math.max(active, 0)]);
    } else if (e.key === "Escape") {
      // Close the suggestions first, then clear the box. A search box clears itself on Escape.
      if (rows.length) { e.preventDefault(); return closeSuggestions(); }
      q.value = ""; updateBangHint(); q.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) return pick(rows[active], e.metaKey || e.ctrlKey);
      const text = q.value;
      // The list may still be loading. Give it a moment.
      if (!heliumBangs && findBang(text) && !ownBang(findBang(text).key)) {
        await Promise.race([loadHeliumBangs(), new Promise((r) => setTimeout(r, 1500))]);
        // Cleared or edited while waiting: that's a new search, with its own Enter
        if (q.value !== text) return;
      }
      const url = resolveText(text);
      if (url) go(url, e.metaKey || e.ctrlKey);
    }
  });

  q.addEventListener("focus", updateSuggestions);
  q.addEventListener("blur", closeSuggestions);
  // Moving the caret in or out of a bang changes what's suggested
  q.addEventListener("click", updateSuggestions);
  q.addEventListener("keyup", (e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) updateSuggestions(); });
  // mousedown would blur the box and clear the list before the click lands
  suggest.addEventListener("mousedown", (e) => e.preventDefault());
  suggest.addEventListener("mousemove", (e) => {
    if (rowsFor !== q.value) return;
    const i = Number(e.target.closest("[data-i]")?.dataset.i ?? active);
    if (i !== active) { active = i; paintSuggestions(); }
  });
  // A middle click opens a page in a new tab, like a link
  suggest.addEventListener("click", (e) => {
    const li = e.target.closest("[data-i]");
    if (li) pick(rows[li.dataset.i], e.metaKey || e.ctrlKey);
  });
  suggest.addEventListener("auxclick", (e) => {
    const li = e.target.closest("[data-i]");
    if (li && e.button === 1 && !rows[li.dataset.i].bang) pick(rows[li.dataset.i], true);
  });
  $("search").addEventListener("submit", (e) => e.preventDefault());

  // The box isn't focused on open, but typing anywhere on the page goes into it
  // Space is left alone: on a focused button it presses it, and a search doesn't start with one.
  document.addEventListener("keydown", (e) => {
    if (e.target === q || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || $("settings").open) return;
    if ((e.key.length === 1 && e.key !== " ") || e.key === "Backspace") q.focus({ preventScroll: true });
  });
}
