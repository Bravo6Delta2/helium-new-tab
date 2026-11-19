// Markup from templates, escaped by default. html`<b>${name}</b>` escapes name, while a
// value that is itself html`…` (or raw(), for markup from somewhere trusted) goes in as is.
// An array is joined, and null and undefined leave nothing. false is "false", as attributes
// like aria-selected="${on}" need it, so a part shown only sometimes is ${on ? html`…` : ""}.

class Html {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const raw = (s) => new Html(String(s));

const part = (v) => v instanceof Html ? v.s
  : Array.isArray(v) ? v.map(part).join("")
  : v == null ? ""
  : esc(v);

export const html = (strings, ...values) =>
  new Html(strings.reduce((out, s, i) => out + part(values[i - 1]) + s));
