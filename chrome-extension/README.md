# Tech Evolution Radar - Chrome Extension

🚀 Replace your new tab with a live tech evolution radar that tracks how tech noise becomes trends and industry standards.

## ✨ Features

- **Live Data Feeds**: Real-time data from GitHub, arXiv, and Hacker News
- **Visual Radar**: Interactive radar visualization showing tech maturity stages
- **Category Filtering**: Filter by AI, Quantum, Robotics, Web3, BioTech, Energy, Space, and Cybersecurity
- **Anomaly Detection**: Highlights trending items with unusual growth
- **Multilingual**: English and Russian language support
- **Offline Caching**: Works offline with cached data
- **Standalone**: Runs entirely in the new tab page, no server or login required
- **AI Blog Digest**: Daily LLM-summarized digest of top AI engineering blogs (hook headline + 3 tweet-style bullets), EN/RU, fetched from the project's public data feed.
- **Honest Evolution Chains**: Real week-over-week topic momentum from accumulated snapshots (no fabricated metrics).

## 🚀 Quick Installation

### Step 1: Generate Icons

Open `icons/generate-icons.html` in your browser and download all 4 icon sizes, OR run:

```bash
# Using Node.js
node generate-icons.js

# Using ImageMagick
cd icons
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 32x32 icon32.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

### Step 2: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder (sources, for development), or run
   `bun run build:extension` and select `dist/extension/unpacked` — the
   minified build that ships in `dist/extension/tech-radar-extension.zip`
5. Done! Open a new tab to see the radar 🎉

## 📁 File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── newtab.html            # Standalone new tab page
├── styles.css             # Styles for standalone version
├── app.js                 # Main application logic
├── generate-icons.js      # Node.js icon generator
├── icons/
│   ├── icon.svg           # Source icon (vector)
│   ├── generate-icons.html # Browser-based icon generator
│   ├── icon16.png         # 16x16 icon (generate this)
│   ├── icon32.png         # 32x32 icon (generate this)
│   ├── icon48.png         # 48x48 icon (generate this)
│   └── icon128.png        # 128x128 icon (generate this)
└── README.md              # This file
```

## 🔧 Configuration

The extension works completely offline, fetching data directly from APIs:

- GitHub Trending Repositories
- arXiv Research Papers
- Hacker News Top Stories

Edit `app.js` to customize:

```javascript
const CONFIG = {
  CACHE_DURATION: 5 * 60 * 1000, // Cache for 5 minutes
  REFRESH_INTERVAL: 10 * 60 * 1000, // Auto-refresh every 10 minutes
  MAX_FEED_ITEMS: 20, // Max items in feed
}
```

## 🎨 Customization

### Adding More Data Sources

In `app.js`, add new fetch functions following this pattern:

```javascript
async function fetchNewSource() {
  try {
    const response = await fetch('https://api.example.com/data')
    const data = await response.json()

    return data.map((item) => ({
      id: `source-${item.id}`,
      title: item.title,
      summary: item.description,
      source: 'new-source',
      sourceUrl: item.url,
      category: categorizeByKeywords(item.title),
      maturityStage: 'research',
      impactScore: 5,
      hypeVolume: 1000,
      publishedAt: new Date(item.date),
      isAnomaly: false,
    }))
  } catch (error) {
    console.error('New source error:', error)
    return []
  }
}
```

Then add it to `fetchAllData()`:

```javascript
const [githubItems, arxivItems, hnItems, newItems] = await Promise.all([
  fetchGitHubTrending(),
  fetchArxivPapers(),
  fetchHackerNews(),
  fetchNewSource(), // Add here
])
```

### Changing Categories

Edit the `CATEGORY_KEYWORDS` object in `app.js`:

```javascript
const CATEGORY_KEYWORDS = {
    ai: ['ai', 'gpt', 'llm', 'machine learning', ...],
    // Add your own category
    myCategory: ['keyword1', 'keyword2', ...],
};
```

## 🐛 Troubleshooting

### "No items found"

- Check your internet connection
- Click the refresh button
- GitHub API has rate limits (60 requests/hour for unauthenticated)

### Icons not showing in Chrome

- Make sure all 4 PNG icons exist in the `icons/` folder
- Use the icon generator to create them

### Extension not loading

- Ensure Developer mode is enabled
- Check for errors: `chrome://extensions/` → Details → "Inspect views"

### CORS errors

- The standalone version uses direct API calls which should work

## 📊 Data Sources

| Source      | API         | Rate Limit       |
| ----------- | ----------- | ---------------- |
| GitHub      | REST API v3 | 60/hour (unauth) |
| arXiv       | OAI-PMH     | No limit         |
| Hacker News | Firebase    | No limit         |

## 🔒 Permissions

The extension requests these permissions:

- **storage**: Save cached data and user preferences
- **host_permissions**: Access APIs (GitHub, arXiv, HN, etc.)

No data is sent to third parties. All processing happens locally.

## 📝 License

MIT License - Feel free to modify and distribute.

## 🙏 Credits

Built with ❤️ for the tech community.

Data sources:

- [GitHub API](https://docs.github.com/en/rest)
- [arXiv API](https://arxiv.org/help/api)
- [Hacker News API](https://github.com/HackerNews/API)
