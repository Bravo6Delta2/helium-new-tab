// Settings (⌥ , or the gear): time format, temperature unit, cities, and search engines and bangs.
import { CONFIG } from "./config.js";
import { html } from "./html.js";
import { icon } from "./icons.js";
import { closePanels } from "./panels.js";
import { $, settings, shimmer } from "./page.js";
import { hostOf, prettyUrl } from "./query.js";
import { defaultEngine, engineNames, SLOTS, templateError } from "./settings.js";
import { validTz } from "./time.js";

const dialog = $("settings");
// Called with what changed, once settings has it, to save it and show it
let save;

function openSettings() {
  closePanels();
  renderGeneral();
  renderSlots();
  renderSearch();
  dialog.showModal();
  shimmer.emphasize();
}

// General, or Search: the engine and your own engines and bangs. Tabs, so only the
// selected one is in the Tab order and the arrow keys move between them.
const tabs = $("settings-tabs");
function showTab(name) {
  for (const b of tabs.children) {
    b.setAttribute("aria-selected", b.dataset.tab === name);
    b.tabIndex = b.dataset.tab === name ? 0 : -1;
  }
  for (const pane of dialog.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== name;
}

/* ---------- general ---------- */
function renderGeneral() {
  for (const seg of dialog.querySelectorAll(".seg[data-setting]")) {
    for (const b of seg.children) b.setAttribute("aria-pressed", b.dataset.value === String(settings[seg.dataset.setting]));
  }
}

/* ---------- search ---------- */
// The search engine, and your own engines and bangs. Each list is edited with the form
// under it: a row loads into the form, which then saves over that row (form.dataset.editing
// holds its name or trigger) until it's saved or emptied.
const engine = $("engine"), engineForm = $("engine-add"), bangForm = $("bang-add");

const entry = (i, key, name, url) => html`
  <li>
    <button class="edit" type="button" data-i="${i}" title="Edit">
      <span class="key">${key}</span><span class="txt">${name ? html`<span>${name}</span>` : ""}<small>${prettyUrl(url)}</small></span>
    </button>
    <button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove ${key}">${icon("x", 16)}</button>
  </li>`;

function renderSearch() {
  // A value of its own, as an option's text has its spaces collapsed
  engine.innerHTML = html`${engineNames(settings, CONFIG).map((name) => html`<option value="${name}">${name}</option>`)}`;
  engine.value = settings.engine;
  $("engines-list").innerHTML = html`${settings.engines.map((e, i) => entry(i, e.name, "", e.url))}`;
  $("bangs-list").innerHTML = html`${settings.bangs.map((b, i) => entry(i, "!" + b.t, b.name, b.url))}`;
  // A name refused as taken may not be any more
  for (const input of dialog.querySelectorAll(".add input")) input.setCustomValidity("");
  for (const form of [engineForm, bangForm]) labelSubmit(form);
}

// What's in the box is found where the browser's validation bubble points
function invalid(input, message) {
  input.setCustomValidity(message);
  input.reportValidity();
}

// What a form's key field holds
const formKey = {
  engines: (f) => f.elements.label.value.trim().replace(/\s+/g, " "),
  bangs: (f) => f.elements.trigger.value.trim().replace(/^!/, "").toLowerCase(),
};
// And a saved entry's
const keyOf = { engines: (e) => e.name, bangs: (b) => b.t };
// The row being edited. Gone when another tab has removed it, and then it's added again.
const editingIndex = (form) =>
  "editing" in form.dataset ? settings[form.dataset.kind].findIndex((x) => keyOf[form.dataset.kind](x) === form.dataset.editing) : -1;
// "Save" while editing a row, "Add" otherwise
function labelSubmit(form) {
  form.querySelector("[type=submit]").textContent = "editing" in form.dataset ? "Save" : "Add";
}
function resetForm(form) {
  form.reset();
  delete form.dataset.editing;
  labelSubmit(form);
}

// Over the row being edited, or as a new one. A name or trigger another row has is refused.
function saveEntry(form, item, keyInput, key) {
  const kind = form.dataset.kind, list = settings[kind];
  const i = editingIndex(form), taken = list.findIndex((x) => keyOf[kind](x) === key);
  if (taken !== -1 && taken !== i) return invalid(keyInput, `${kind === "bangs" ? "!" + key : key} is already in your list. Click it there to edit it.`);
  if (i === -1) list.push(item);
  else {
    // The engine in use keeps being used under its new name
    if (kind === "engines" && list[i].name === settings.engine) settings.engine = item.name;
    list[i] = item;
  }
  save(kind);
  resetForm(form);
  renderSearch();
}

function bindSearch() {
  $("engine-field").insertAdjacentHTML("beforeend", icon("chevron-down", 16));
  engine.addEventListener("change", () => { settings.engine = engine.value; save("engine"); });

  engineForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { label, url } = engineForm.elements;
    const name = formKey.engines(engineForm), template = url.value.trim();
    if (!name) return invalid(label, "Give it a name");
    if (Object.hasOwn(CONFIG.search.engines, name)) return invalid(label, `${name} is already in the list`);
    const err = templateError(template, true);
    if (err) return invalid(url, err);
    saveEntry(engineForm, { name, url: template }, label, name);
  });
  bangForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { trigger, label, url } = bangForm.elements;
    const t = formKey.bangs(bangForm), template = url.value.trim();
    if (!t || /\s/.test(t)) return invalid(trigger, "One word, like cl");
    const err = templateError(template, false);
    if (err) return invalid(url, err);
    saveEntry(bangForm, { t, name: label.value.trim() || hostOf(template.replaceAll("%s", "x")) || "!" + t, url: template }, trigger, t);
  });

  for (const form of [engineForm, bangForm]) {
    const kind = form.dataset.kind;
    const inputs = form.querySelectorAll("input"), list = $(kind + "-list");
    form.addEventListener("input", (e) => {
      e.target.setCustomValidity("");
      // Emptied, it's back to adding a new one
      if ([...inputs].every((i) => !i.value)) resetForm(form);
    });
    list.addEventListener("click", (e) => {
      const edit = e.target.closest("[data-i]"), remove = e.target.closest("[data-remove]");
      // A double click's second click would land on the ✕ of the row moving up into its place
      if (remove && e.detail > 1) return;
      if (remove) {
        const i = Number(remove.dataset.remove);
        const [gone] = settings[kind].splice(i, 1);
        // The engine in use falls back to the default
        if (kind === "engines" && gone.name === settings.engine) settings.engine = defaultEngine(CONFIG);
        if (form.dataset.editing === keyOf[kind](gone)) resetForm(form);
        save(kind);
        renderSearch();
        // Focus stays in the list, on the row that took its place, rather than going back to the top
        const buttons = list.querySelectorAll("[data-remove]");
        (buttons[Math.min(i, buttons.length - 1)] ?? inputs[0]).focus();
      } else if (edit) {
        const item = settings[kind][edit.dataset.i];
        const { elements: f } = form;
        if (kind === "engines") f.label.value = item.name;
        else {
          f.trigger.value = item.t;
          // A name that was only the site's is left out, to follow the address if it changes
          f.label.value = item.name === hostOf(item.url.replaceAll("%s", "x")) ? "" : item.name;
        }
        f.url.value = item.url;
        for (const input of inputs) input.setCustomValidity("");
        form.dataset.editing = keyOf[kind](item);
        labelSubmit(form);
        f.url.focus();
      }
    });
  }
}

/* ---------- cities ---------- */
// Open-Meteo's geocoder, which also gives each city's time zone
async function searchCities(name, signal) {
  const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" + encodeURIComponent(name), { signal });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return ((await res.json()).results || []).filter((r) => r.timezone && validTz(r.timezone)).map((r) => ({
    name: r.name, region: r.admin1 ?? "", country: r.country ?? "",
    lat: r.latitude, lon: r.longitude, tz: r.timezone,
  }));
}

function renderSlots() {
  for (const box of dialog.querySelectorAll(".slots")) {
    box.replaceChildren(...SLOTS.map((label, i) => slotField(box.dataset.kind, i, label)));
  }
}

function slotField(kind, i, label) {
  const el = document.createElement("div");
  el.className = "slot";
  const id = `results-${kind}-${i}`;
  el.innerHTML = html`
    <span>${label}</span>
    <div class="input-field">
      <span class="accessory">${icon(kind === "weather" ? "map-pin" : "clock", 16)}</span>
      <input type="text" placeholder="Add a city" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}"
        aria-label="${label} ${kind === "weather" ? "weather" : "world clock"} city" autocomplete="off" spellcheck="false">
      <span class="country"></span>
      <button class="icon-btn" type="button" aria-label="Remove ${label.toLowerCase()} city">${icon("x", 16)}</button>
    </div>
    <ul class="results" id="${id}" role="listbox"></ul>`;
  const input = el.querySelector("input"), list = el.querySelector(".results");
  const country = el.querySelector(".country"), remove = el.querySelector(".icon-btn");
  // "foundFor" is the text the results are for. Enter only picks one while it's still in the box.
  let found = [], foundFor = "", active = 0, timer, ctrl;

  const paint = (note) => {
    list.innerHTML = note ? html`<li class="note">${note}</li>` : html`${found.map((c, j) =>
      html`<li role="option" id="${id}-${j}" data-j="${j}" class="${j === active ? "active" : ""}" aria-selected="${j === active}">
        ${c.name}<small>${[c.region, c.country].filter(Boolean).join(", ")}</small>
      </li>`)}`;
    input.setAttribute("aria-expanded", list.children.length > 0);
    if (found[active]) input.setAttribute("aria-activedescendant", `${id}-${active}`);
    else input.removeAttribute("aria-activedescendant");
  };
  const show = (items, note, query = "") => { found = items; foundFor = query; active = 0; paint(note); };
  // Back to the saved city, dropping whatever was typed
  const reset = () => {
    clearTimeout(timer);
    ctrl?.abort();
    const city = settings[kind][i];
    input.value = city?.name ?? "";
    country.textContent = city?.country ?? "";
    remove.hidden = !city;
    show([]);
  };
  const set = (city) => {
    settings[kind][i] = city;
    save(kind);
    reset();
  };

  input.addEventListener("focus", () => input.select());
  input.addEventListener("blur", reset);
  input.addEventListener("input", () => {
    clearTimeout(timer);
    // A search for older text may still answer, and mustn't
    ctrl?.abort();
    const name = input.value.trim();
    if (name.length < 2) return show([]);
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const cities = await searchCities(name, ctrl.signal);
        show(cities, cities.length ? "" : "No cities found", name);
      } catch (err) {
        if (err.name !== "AbortError") show([], "City search is unavailable right now");
      }
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && found.length) {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length;
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (found[active] && foundFor === input.value.trim()) set(found[active]);
    } else if (e.key === "Escape" && list.children.length) {
      // Close the results first, the dialog on the next Escape
      e.preventDefault();
      e.stopPropagation();
      reset();
    }
  });
  // mousedown would blur the input and clear the list before the click lands
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("mousemove", (e) => {
    const j = Number(e.target.closest("[data-j]")?.dataset.j ?? active);
    if (j !== active) { active = j; paint(); }
  });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("[data-j]");
    if (li) set(found[li.dataset.j]);
  });
  remove.addEventListener("click", () => set(null));
  el.querySelector(".input-field").addEventListener("click", (e) => { if (!e.target.closest("button")) input.focus(); });

  reset();
  return el;
}

/* ---------- the dialog ---------- */
// onChange(kind) is called once settings holds a change made here, to save and apply it
export function initSettingsDialog(onChange) {
  save = onChange;
  $("settings-open").innerHTML = icon("settings");
  // ⌘O and ⌘, belong to the browser, so the page uses Option/Alt + comma
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥ ," : "Alt + ,";
  $("shortcut").textContent = shortcut;
  $("settings-open").title = `Settings (${shortcut})`;

  $("settings-open").addEventListener("click", openSettings);
  // A click on the backdrop closes it
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
  });
  document.addEventListener("keydown", (e) => {
    // e.code, because ⌥ , types "≤" on a Mac
    if (e.code !== "Comma" || !e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (dialog.open) dialog.close();
    else openSettings();
  });

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  tabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tabs.querySelector('[aria-selected="false"]');
    showTab(next.dataset.tab);
    next.focus();
  });
  showTab("general");

  // Time format and temperature unit
  for (const seg of dialog.querySelectorAll(".seg[data-setting]")) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-value]");
      if (!b) return;
      settings[seg.dataset.setting] = b.dataset.value === "true";
      renderGeneral();
      save(seg.dataset.setting);
    });
  }
  bindSearch();
}

// Another tab changed these settings. Only what changed is redrawn, as redrawing a list
// loses the focus in it.
export function refreshSettingsDialog(changed) {
  if (!dialog.open) return;
  if (changed.some((k) => k === "hour12" || k === "fahrenheit")) renderGeneral();
  if (changed.some((k) => k === "weather" || k === "clocks")) renderSlots();
  if (changed.some((k) => k === "engine" || k === "engines" || k === "bangs")) renderSearch();
}
