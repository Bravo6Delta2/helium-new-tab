// Defaults. Time format, temperature unit, search engine and cities can be changed in
// Settings (⌥ ,), and what's picked there wins over these. Settings can also add search
// engines and bangs to the ones here.
export const CONFIG = {
  hour12: false,
  fahrenheit: false,

  search: {
    engine: "Google",
    // The engines Settings offers. Add your own as name: URL, with %s for the search terms.
    engines: {
      Google: "https://www.google.com/search?q=%s",
      DuckDuckGo: "https://duckduckgo.com/?q=%s",
      Brave: "https://search.brave.com/search?q=%s",
      Bing: "https://www.bing.com/search?q=%s",
      Kagi: "https://kagi.com/search?q=%s",
      Startpage: "https://www.startpage.com/do/search?query=%s",
      Ecosia: "https://www.ecosia.org/search?q=%s",
    },
    // Bangs come from Helium's own list (the one its address bar uses).
    // A bang that isn't in it is passed to DuckDuckGo, which knows a few thousand more.
    bangList: "https://services.helium.imput.net/bangs.json",
    unknownBang: "https://duckduckgo.com/?q=%s",
  },
  // Your own bangs. These win over Helium's list, and ones added in Settings win over these, e.g.
  // cl: ["Claude", "https://claude.ai/new?q=%s"],
  bangs: {
  },

  // The left and right slots. null leaves a slot empty. Weather needs coordinates,
  // e.g. { name: "Tokyo", lat: 35.6895, lon: 139.6917 }, and world clocks a time zone,
  // e.g. { name: "Tokyo", country: "Japan", tz: "Asia/Tokyo" }
  cities: [null, null],
  clocks: [null, null],

  // A blocked request never loads, so bandwidth and time saved are estimates:
  // rough averages per blocked request, about the ratios Brave's new tab uses.
  ublock: { bytesPerBlock: 45_000, msPerBlock: 50 },
};
