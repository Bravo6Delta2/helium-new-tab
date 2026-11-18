# Helium New Tab

A new tab page for [Helium](https://helium.computer) and other Chromium browsers, styled after Helium's own Prism design. Plain HTML, CSS and JavaScript with no build step and no dependencies.

## Features

- **Clock** in 24-hour or 12-hour time, over Prism's animated gradient shimmer.
- **Search** with your choice of engine (Google, DuckDuckGo, Brave, Bing, Kagi, Startpage, Ecosia):
  - **Bangs** like `!yt lofi` or `lofi !yt`, from the same list Helium's address bar uses. Bangs that list doesn't have are passed to DuckDuckGo.
  - **Suggestions** for bangs as you type them, and for pages from your history and bookmarks.
  - URLs, `localhost:3000` and `chrome://` pages open directly.
  - Typing anywhere on the page goes into the search box.
- **Weather** for up to two cities, from [Open-Meteo](https://open-meteo.com): current conditions, a weekly forecast, sunrise and sunset, air quality, and pollen (pollen is only available for Europe). The last forecast is kept for when you're offline.
- **World clocks** for up to two time zones.
- **Browsing activity** from your history, like Vivaldi's: visits per day, your busiest hour, top sites, and how you reached pages (typed, link, bookmark…) for today or the last 7, 30 or 90 days.
- **uBlock Origin stats**: trackers, ads and other requests blocked, with estimates of the bandwidth and time saved, broken down by company using [Disconnect's](https://disconnect.me/trackerprotection) tracker list.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.
4. Open a new tab.

The uBlock Origin stats need [uBlock Origin](https://github.com/gorhill/uBlock) installed (Helium includes it). Blocking only counts from the moment this extension is installed.

## Settings

Open Settings with the gear button or <kbd>⌥</kbd> <kbd>,</kbd> (<kbd>Alt</kbd> <kbd>,</kbd> on Windows and Linux) to choose:

- the search engine
- 24-hour or 12-hour time
- Celsius or Fahrenheit
- the cities for the weather cards and world clocks

Anything else is set in the `CONFIG` object at the top of [`app.js`](app.js), including:

- **Search engines.** Add your own as `Name: "https://example.com/search?q=%s"`.
- **Your own bangs.** These take priority over Helium's list:
  ```js
  bangs: {
    cl: ["Claude", "https://claude.ai/new?q=%s"],
  },
  ```
- **Default cities and clocks**, used until you pick some in Settings.
- **uBlock estimates**, the bytes and milliseconds assumed saved per blocked request.

Reload the extension at `chrome://extensions` after editing it.

## Privacy

Everything is stored locally in your browser. The page only contacts:

| Service | When | Why |
| --- | --- | --- |
| `api.open-meteo.com`, `air-quality-api.open-meteo.com` | A weather city is set | Forecast, air quality and pollen |
| `geocoding-api.open-meteo.com` | Searching for a city in Settings | City lookup and time zone |
| `services.helium.imput.net` | The first time you type a bang | Helium's bang list |
| `raw.githubusercontent.com` | uBlock Origin first blocks a request, then weekly | Disconnect's tracker list |

Your searches go to the engine or bang you use, as with any search box.

Browsing activity is read from the browser's own history and cleared when you delete history. Requests from incognito tabs are never counted.

### Permissions

| Permission | Used for |
| --- | --- |
| `history` | Browsing activity and search suggestions |
| `bookmarks` | Search suggestions |
| `favicon` | Site icons in suggestions and activity |
| `storage` | Settings, cached forecasts and stats |
| `webRequest` and `<all_urls>` | Seeing which requests uBlock Origin blocks. Nothing is changed or blocked by this extension. |

## Files

| File | Contents |
| --- | --- |
| `index.html` | Page markup and styles |
| `app.js` | Clock, search, weather, world clocks, activity, uBlock stats and settings |
| `background.js` | Service worker that counts uBlock Origin's blocked requests |
| `shimmer.js` | Prism's gradient shimmer, ported to plain WebGL2 |
| `fonts/` | Instrument Sans |
| `icons/` | Icons |

## Credits

- [Helium Prism](https://github.com/imputnet/helium-prism) (GPL-3.0): the design and the gradient shimmer in `shimmer.js`
- [Tabler Icons](https://tabler.io/icons) (MIT)
- [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) (OFL)
- [Open-Meteo](https://open-meteo.com): weather, air quality and geocoding
- [Disconnect tracking protection list](https://github.com/disconnectme/disconnect-tracking-protection) (CC BY-NC-SA 4.0)
- Bangs from [Helium](https://github.com/imputnet/helium) and [Kagi](https://github.com/kagisearch/bangs)

## License

[GPL-3.0](LICENSE), as `shimmer.js` is ported from Helium Prism, which is GPL-3.0.
