# Tech Evolution Radar - Chrome Extension

Replaces the new-tab page with a live radar of engineering and research
signals from GitHub, arXiv and Hacker News, fetched directly from the browser.

## Features

- **Live data**: GitHub repositories created this week, the newest arXiv
  submissions, and the Hacker News front page, cached locally for five minutes
  and painted stale-while-revalidate.
- **Signal ranking** (`lib/scoring.js`): every item is placed among its own
  source's peers — reach (percentile of stars or points), velocity (percentile
  of engagement per day of age) and recency (age decay per source). arXiv
  reports no attention metric, so its items are shown but not scored.
- **Highlights with a reason**: an item is emphasized only when its velocity
  is a robust outlier among at least four peers from the same source
  ("fast-rising"), and the reason is shown next to it. The full dashboard adds
  Jev's novelty and topic judgments; the extension holds no API key and does
  not pretend to.
- **Radar**: maturity rings (from star or point counts), category colors,
  hover tooltip, click to open, keyboard navigation (arrows, Enter).
- **Topic momentum** and **AI blog digest**: read from the project's public
  `public/data/*.json` on raw.githubusercontent.com (mirrors in
  `lib/config.js`).
- **Languages**: English and Russian UI. Non-English item text (for example a
  Chinese GitHub description) is machine-translated to English via MyMemory
  so it reads on machines without CJK fonts; the original is one click away.
- **No fonts, no glow**: system font stack, one accent color, inline SVG
  icons (`lib/icons.js`). The packaged extension is about 25 KB.

## Installation

1. `bun run build:extension` in the repository root, or download the zip from
   the dashboard's extension banner.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select `dist/extension/unpacked` (or the
   extracted `tech-radar-extension` folder from the zip). For development you
   can load `chrome-extension/` itself.
4. Open a new tab.

## File structure

```
chrome-extension/
├── manifest.json        # MV3 manifest, CSP, host permissions
├── newtab.html          # New-tab page
├── styles.css           # Styles
├── app.js               # Fetching, ranking, rendering
├── lib/                 # Pure modules, unit-tested with vitest
│   ├── scoring.js       # Signal model (percentiles, velocity, recency, reasons)
│   ├── categorize.js    # Keyword categories (the extension has no Jev key)
│   ├── detect-language.js
│   ├── icons.js         # Inline SVG icons
│   ├── digest.js, trends-view.js, data-source.js, config.js, lru-cache.js, jitter.js
│   └── __tests__/
├── icons/               # Extension icons (generate with generate-icons.js)
└── generate-icons.js    # Dev tool, not shipped
```

`scripts/build-extension.ts` walks the reference graph from `manifest.json`
and ships only what the page loads: tests, this README and dev tools are never
packaged.

## Configuration

Edit `app.js`:

```javascript
const CONFIG = {
  CACHE_DURATION: 5 * 60 * 1000, // cache for 5 minutes
  REFRESH_INTERVAL: 10 * 60 * 1000, // auto-refresh every 10 minutes
  MAX_FEED_ITEMS: 30,
}
```

Data mirrors live in `lib/config.js`; every mirror must stay on
raw.githubusercontent.com, the only host in `host_permissions` (widening it
forces every install to re-approve).

## Troubleshooting

- **No items**: check the connection and click refresh. GitHub allows 60
  unauthenticated requests per hour.
- **No translation**: MyMemory's keyless quota is small and shared per IP;
  after a 429 the extension pauses translation for an hour and shows original
  text.
- **arXiv missing when served over plain HTTP**: arXiv sends no CORS header
  to a `http://` origin. Inside Chrome the extension origin bypasses CORS via
  `host_permissions`.
- **Extension not loading**: ensure Developer mode is on and inspect errors
  under `chrome://extensions/` → Details → Inspect views.

## Data sources

| Source      | API         | Rate limit       |
| ----------- | ----------- | ---------------- |
| GitHub      | REST API v3 | 60/hour (unauth) |
| arXiv       | Atom API    | No limit         |
| Hacker News | Firebase    | No limit         |

## Permissions

- **storage**: cached data and preferences
- **host_permissions**: GitHub, arXiv, Hacker News, MyMemory, raw.githubusercontent.com

No data is sent anywhere else; all processing happens locally.

## License

MIT
