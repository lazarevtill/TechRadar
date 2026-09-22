# Tech Evolution Radar - Chrome Extension

Replaces the new-tab page with a calm radar of research and engineering
signals. The extension is a thin client: **it holds no API keys and calls no
third-party API.** Your TechRadar server fetches all eight sources, runs Jev
(categories, novelty, topics), translates, and scores; the extension renders
what `GET /api/extension-feed` returns.

## Features

- **One request per refresh** to your TechRadar server: feed, AI blog digest
  and topic momentum arrive together. The page's CSP and `host_permissions`
  name only that server.
- **Offline-first**: the last successful response is saved in
  `chrome.storage.local` and painted immediately on every new tab. If the
  server cannot be reached, the saved data stays on screen with a banner —
  "Not connected to the TechRadar server — showing data saved <time>" — and a
  **Retry** button. The failure is remembered, so later tabs keep asking the
  server (and keep the banner) until it answers; coming back online retries
  automatically.
- **Same signals as the dashboard**: server-computed score and highlight
  reasons (fast-rising, converging, new capability, under the radar), Jev
  categories and maturity.
- **Readable CJK text on any machine**: the server relays Noto Sans SC/JP
  (`/api/fonts/cjk`, unicode-range slices downloaded only when needed), so
  Chinese and Japanese titles never render as boxes.
- **Radar**: maturity rings, category colors, hover tooltip, click to open,
  keyboard navigation (arrows, Enter).
- **Languages**: English and Russian UI; server-made translations are shown
  with the original one click away.

## Installation

1. Run the server: `docker compose up -d` (serves `http://localhost:3000`).
2. Build the extension for it: `bun run build:extension`, or use **Download
   Extension** on the dashboard.
3. Open `chrome://extensions/`, enable **Developer mode**, click **Load
   unpacked** and select `dist/extension/unpacked` (or the extracted
   `tech-radar-extension` folder).

### Pointing at another server

The server address is fixed at build time:

```bash
EXTENSION_BACKEND_URL=https://radar.example.com bun run build:extension
# Docker image with a matching "Download Extension":
EXTENSION_BACKEND_URL=https://radar.example.com docker compose up --build -d
```

`scripts/build-extension.ts` writes that origin into `lib/config.js`
(`__TECHRADAR_BACKEND_URL__`) and into the built manifest's
`host_permissions` and CSP (`connect-src`, `style-src`, `font-src`). Loading
`chrome-extension/` unpacked from source uses `http://localhost:3000`.

## File structure

```
chrome-extension/
├── manifest.json        # MV3 manifest; host/CSP limited to the server
├── newtab.html          # New-tab page
├── styles.css           # Styles
├── app.js               # Loading, offline state, rendering
├── lib/                 # Pure modules, unit-tested with vitest
│   ├── backend.js       # GET /api/extension-feed + payload checks
│   ├── config.js        # Server URL (build-time) and cache timings
│   ├── icons.js         # Inline SVG icons
│   ├── digest.js, trends-view.js, jitter.js
│   └── __tests__/
├── icons/               # Extension icons (generate with generate-icons.js)
└── generate-icons.js    # Dev tool, not shipped
```

The build walks the reference graph from `manifest.json` and ships only what
the page loads (tests, this README and dev tools are never packaged).

## Troubleshooting

- **"Not connected to the TechRadar server"**: start it (`docker compose up
-d`) or check that the extension was built for the right address (shown in
  the banner), then press **Retry**.
- **Stale numbers**: the saved copy refreshes every 10 minutes and on the
  refresh button; the server itself serves a snapshot at most 5 minutes old.

## Permissions

- **storage**: the saved feed and preferences
- **host_permissions**: your TechRadar server only

## License

MIT
