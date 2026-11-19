// A .wx holds a pill and the panel it opens: the weather cards and the dock's reports.
// One is open at a time, and a click outside or Escape closes it.
import { shimmer } from "./page.js";

export function initPanels() {
  document.addEventListener("click", (e) => { if (!e.target.closest(".wx")) closePanels(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });
}

export function closePanels(except) {
  for (const el of document.querySelectorAll(".wx.open")) {
    if (el === except) continue;
    el.classList.remove("open");
    el.querySelector(".pill").setAttribute("aria-expanded", "false");
  }
}

export function bindPanel(el) {
  el.addEventListener("click", (e) => {
    if (!e.target.closest(".pill")) return;
    closePanels(el);
    el.classList.toggle("open");
    el.querySelector(".pill").setAttribute("aria-expanded", el.classList.contains("open"));
    if (el.classList.contains("open")) shimmer.emphasize();
  });
}
