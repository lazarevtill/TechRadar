# Gap audit — TechRadar

Scope: `main` at `70e084d` (after the history-store merge). Question: what is
still missing for long-term running, and for the goal of seeing what others
can't because of the volume of information.

Method: three read-only passes (server pipeline, both clients, ops/CI/docs),
then the high-severity claims re-checked by hand. Every finding cites the
code; line numbers are at `70e084d`. Nothing was fixed during the audit.

Severity: **H** = wrong or lost data, or a failure that goes unnoticed ·
**M** = missing capability or a real risk · **L** = polish.

---

## 1. Running unattended

| #   | Sev | Evidence                                                                       | Gap                                                                                                                                                                                                                                                                                                      | Direction                                                                                           |
| --- | --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R1  | H   | `tech-feed.ts:1653-1678`; no `setInterval`/cron in `server.ts` or `src/server` | Nothing runs unless a request arrives: history, discovery, evaluation, backups, alerts and the weekly webhook all ride on a feed rebuild. In Docker the image healthcheck happens to fetch `/` every 30 s (`Dockerfile:45-46`), and the page render prefetches the feed, so rebuilds happen by accident. | Add an explicit in-process schedule (rebuild every 5 min). Only then re-point the healthcheck (R6). |
| R2  | H   | `tech-feed.ts:405`; each fetcher's `catch` returns `[]` (e.g. `:550-553`)      | `source_runs.error` is only ever `'timeout'`. A 500, a DNS failure and "no new items" all record as `items=0, error=null`, so health and alerts can't say _why_ a source is down.                                                                                                                        | Fetchers return or throw error detail; `withinBudget` records it.                                   |
| R3  | H   | `db.ts:201-207`                                                                | `schema_version` is overwritten on every open and never read. `CREATE TABLE IF NOT EXISTS` never adds columns, so the first schema change after release will break existing volumes.                                                                                                                     | Read the stored version, apply ordered migrations, then write it.                                   |
| R4  | M   | `health.ts:36`                                                                 | `ok` ignores feed age and degraded sources, is `true` when there are no runs at all, and a source with no runs in 7 days drops off the list instead of showing as down.                                                                                                                                  | Compare against the expected source list; flag a stale feed.                                        |
| R5  | M   | `ops.ts:183-192`, `docker-compose.yml:79-82`                                   | Backups go to the same volume as the database, and there is no restore procedure. Losing the volume loses the backups. The daily `VACUUM INTO` is synchronous inside a rebuild.                                                                                                                          | Document a host-side copy and restore; move the backup off the request path.                        |
| R6  | M   | `Dockerfile:45-46`                                                             | The healthcheck probes `/`, not `/api/health` (which returns 503 when the store fails).                                                                                                                                                                                                                  | Switch it once R1 is in.                                                                            |
| R7  | M   | `ops.ts:198-211`                                                               | Retention skips `terms`, `predictions`, `themes` and `usage`. Every rebuild loads all control subjects (`predictions.ts:72-78`).                                                                                                                                                                         | Add retention for these tables; query controls per cohort.                                          |
| R8  | M   | `translation.ts:27`, `:47-49`                                                  | The translation cache never evicts, and it is filled by public server functions. Its key is only the first 100 characters of the text, so two texts that start the same get each other's translation.                                                                                                    | Use an LRU keyed by a hash of the full text.                                                        |
| R9  | L   | `db.ts:201`; `discovery.ts:342`; `health.ts:72-87`                             | No `busy_timeout`. The theme insert isn't `OR IGNORE`. Overlapping rebuilds could send the same alert twice. Safe only with a single process.                                                                                                                                                            | Add `busy_timeout`; make the insert idempotent; state "one replica" in the docs.                    |
| R10 | L   | `usage.ts:16`; `tech-feed.ts:312` vs `:1603`                                   | Usage counters live in memory until drained. Translation usage is drained before translation runs, so it lands in the next rebuild, sometimes the next day.                                                                                                                                              | Drain after translation.                                                                            |
| R11 | L   | `verdict-store.ts:125-126`                                                     | Every `get` marks the store dirty, so the whole JSON file is rewritten on every rebuild.                                                                                                                                                                                                                 | Only mark dirty when last-seen changes by a day or more.                                            |
| R12 | L   | `tech-feed.ts:1334`                                                            | The bioRxiv timeout (35 s plus a retry) is longer than the 30 s source budget, so cold rebuilds always record `timeout`.                                                                                                                                                                                 | Keep the upstream timeout under the budget.                                                         |

## 2. Correctness of the long-term signals

| #   | Sev | Evidence                                                      | Gap                                                                                                                                                                                                                                                                                            | Direction                                                                          |
| --- | --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S1  | H   | `predictions.ts:212-217`, `:270`, `:295`; `metric-refetch.ts` | One failed re-read (429, 5xx, a network error, or GitHub's keyless 60/hour limit against 60 fetches per pass) marks a prediction `unavailable` for good. The track record then drops it silently, and a cohort whose controls all failed drops its highlights too. No count of these is shown. | Retry transient failures on later passes; show the unavailable and dropped counts. |
| S2  | M   | `discovery.ts:304-316` → `predictions.ts:101`                 | A retired theme that comes back is never scored a second time (`INSERT OR IGNORE` on the same key), yet the report lists it as new.                                                                                                                                                            | Put the day in the key, or keep a comeback prediction.                             |
| S3  | M   | `report.ts:90`                                                | Retired themes in the report fall back to the raw lowercase term, because only active themes provide labels.                                                                                                                                                                                   | Read display names from `themes`.                                                  |
| S4  | L   | `tech-feed.ts:1107`                                           | The CiNii id falls back to the list position, which is not stable, so history and verdicts can attach to the wrong paper.                                                                                                                                                                      | Hash the title and URL instead.                                                    |
| S5  | L   | `predictions.ts:204`                                          | A non-theme prediction with a null source stays pending forever.                                                                                                                                                                                                                               | Mark it `unavailable`.                                                             |
| S6  | L   | `db.ts:89`                                                    | The outcome column comment says `'unknown'`; the code writes `'measured'` and `'unavailable'`.                                                                                                                                                                                                 | Fix the comment.                                                                   |

## 3. Exposure and abuse

| #   | Sev | Evidence                 | Gap                                                                                                                                                     | Direction                               |
| --- | --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| X1  | H   | `tech-feed.ts:1791`      | `invalidateTechFeedCacheFn` is a public POST: anyone can clear every source cache and force a full re-fetch of 13 upstream APIs plus Jev.               | Require an admin token, or throttle it. |
| X2  | M   | `tech-feed.ts:1721-1781` | The per-source server functions (GitHub, arXiv, HN, multilingual) are callable but unused. They spend Jev and MyMemory quota without recording history. | Delete them.                            |
| X3  | M   | `api.health.ts:8-28`     | `/api/health` is public: usage ledger, storage size, backup name, per-source errors.                                                                    | Optional bearer token (`HEALTH_TOKEN`). |
| X4  | M   | `api.report.ts:19-35`    | No cache and no rate limit. Each call rebuilds the report (a 14-day `workGroups` pass plus up to 10 `LIKE` scans).                                      | Cache per watch set for 5 min.          |
| X5  | L   | `report.ts:27`           | The validator allows 20 watch terms; the parser keeps 10.                                                                                               | Align them.                             |

## 4. Clients

| #   | Sev | Evidence                                                                                                              | Gap                                                                                                                                                                                       | Direction                                                  |
| --- | --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| C1  | H   | `chrome-extension/app.js:773-787`, `:1079-1104`                                                                       | The weekly report isn't saved with the offline copy. Offline, the extension replaces a good report with "unavailable on this server", which is wrong when the server is just unreachable. | Save it with the feed; word network errors differently.    |
| C2  | H   | `src/components/dashboard/FeedItem.tsx`; `watch.ts:38` used only on the server                                        | The dashboard feed doesn't mark or filter watched items; the extension does (`app.js:1288-1293`, `:1785-1793`).                                                                           | Share the saved terms; add a watch chip and a feed filter. |
| C3  | M   | `signal-format.ts:49-55`; `app.js:618-626`; `signal-model.ts:49-50`                                                   | `velocityObserved` is never shown: measured growth and the age-based estimate look identical. The help texts still describe only the estimate (`translations.ts:486`, `app.js:255`).      | Mark observed growth; update the help.                     |
| C4  | M   | `tech-categories.ts:66` is the only reference                                                                         | `firstSeen` is never shown. "When did the radar first see this" is exactly the early-signal proof.                                                                                        | Show "first seen" in the detail modal and feed rows.       |
| C5  | M   | `app.js:695-712`; `api.health.ts` has no CORS                                                                         | The extension doesn't show discovered themes as a list or any source health; `/api/health` couldn't be read cross-origin anyway.                                                          | Add a themes block; add CORS plus a status line.           |
| C6  | M   | `TopicConvergence.tsx:90-107`                                                                                         | Dashboard topic rows can't filter the feed (the extension's can).                                                                                                                         | Add a topic filter.                                        |
| C7  | M   | `Highlights.tsx:36-41`, `TopicConvergence.tsx:83-84`, `StatsPanel.tsx:56`, `:103-124`, `ParserControlPanel.tsx:37-46` | Error and empty states: a failed feed reads as "nothing stands out" or zeros, the track record can render only its label, and a failed health request shows dashes.                       | Explicit error and empty lines.                            |
| C8  | M   | `newtab.html:48,77-81,145,159,209,243,281`                                                                            | English-only accessible names in the extension.                                                                                                                                           | Add them to i18n.                                          |
| C9  | L   | `WeeklyReport.tsx:26-41`                                                                                              | The report is requested twice on mount (once with no terms, then with the saved ones).                                                                                                    | Wait for the saved terms before querying.                  |
| C10 | L   | `manifest.json:6`; `chrome-extension/README.md:5`                                                                     | Still say "eight sources".                                                                                                                                                                | Change to thirteen.                                        |
| C11 | L   | `app.js:1291,1115`; `TopicConvergence.tsx:66,72-78`                                                                   | Watch toggles have no `aria-pressed`; theme dates and hints exist only in hover titles.                                                                                                   | Visible text or focusable elements.                        |
| C12 | L   | see the inspector notes                                                                                               | Unused i18n keys in both clients; the `InstallationGuide` barrel export; the extension hardcodes the 4-source threshold and "14 days".                                                    | Clean up.                                                  |

## 5. CI, deploy and docs

| #   | Sev | Evidence                          | Gap                                                                                                                  | Direction                                        |
| --- | --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D1  | M   | `verify.yml:17-23`                | Node isn't pinned. The store tests need `node:sqlite` (Node ≥ 22.13). They pass today on the runner's Node, by luck. | `actions/setup-node` with a pinned version.      |
| D2  | M   | `db.ts:132-145`                   | The production `bun:sqlite` path has no automated test; only Docker runs showed it working.                          | Smoke job: boot the image and hit `/api/health`. |
| D3  | M   | `publish-image.yml`               | The image is pushed as `latest` without waiting for Verify.                                                          | `workflow_run` on Verify success.                |
| D4  | M   | `README.md:59-65,115-126,140-142` | The README lists 5 of 14 env vars and 8 of 13 sources, and says "the extension never calls this server".             | Sync the README with CLAUDE.md.                  |
| D5  | L   | `package.json:12`                 | `test:parsers` is still broken and unused.                                                                           | Remove it or reimplement it.                     |

## 6. Capability gaps for the goal

These are judgments about what's missing, not code defects.

1. **Themes can't be followed over time.** The history store holds daily term and topic counts, but nothing plots a theme's curve, when it started or who carried it first. That curve, drawn from 13 sources, is what shows a trend before others notice it.
2. **Discovery sees only titles.** `extractTerms(item.title)` (`history.ts:84`) skips summaries, repo topics, arXiv categories and HF tags, which is where most method and model names appear first.
3. **No entity layer.** Labs, companies, authors and repos that recur across sources are not tracked (for example "which lab shipped three trending things this month").
4. **Watch terms only reach you weekly.** A watched term's first appearance, or a burst, doesn't trigger an immediate webhook.
5. **The digest pipeline doesn't use the store.** `scripts/generate-feed` keeps its own series in `public/data/history.json` and never sees discovered themes, so there are two ways of counting topics.
6. **Blocked sources:** patents (needs your USPTO Open Data Portal API key), Reddit (needs an OAuth app), Bluesky (403 without auth). All three are independent signal types: commercial intent, practitioner discussion and social discussion.
7. **No export or API for the long history** (CSV/JSON of theme curves, the prediction log). The data exists but can only be seen through the fixed panels.

---

## Summary

| Area               | Findings (H/M/L) | Rough completeness                                                        |
| ------------------ | ---------------- | ------------------------------------------------------------------------- |
| Running unattended | 3/5/4            | ~70% — works, but relies on traffic and records too little about failures |
| Signal correctness | 1/2/3            | ~85% — the model is sound; the track record loses data silently           |
| Exposure           | 1/3/1            | ~60% — writes and cost-bearing calls are open                             |
| Clients            | 2/6/4            | ~75% — new features shown, but uneven between the two clients             |
| CI/deploy/docs     | 0/4/1            | ~70%                                                                      |

**Could not verify** (needs the live deployment or accounts): the replica count and any proxy or auth in front of `/api/*`; real traffic and how often rebuilds happen; how long `VACUUM INTO` blocks at full size; upstream keyless rate limits under the evaluation load; screen-reader and contrast behavior; the digest CI job's Jev re-send behavior.

---

## Resolution (branch `fix/gap-audit`)

Every finding above was addressed. Commits are on the branch; the right-hand
column says what changed, or why the suggested direction was not followed.

| #   | Status  | Commit               | What changed                                                                                                                                                                 |
| --- | ------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Fixed   | `9e62f0b`            | Custom server entry starts an in-process schedule (`FEED_SCHEDULE_MINUTES`, default 5); maintenance runs from it.                                                            |
| R2  | Fixed   | `9e62f0b`            | Fetchers rethrow; the budget wrapper records the reason. `0ab9aba`: CiNii/HF/Lobsters/preprints fail on a real outage.                                                       |
| R3  | Fixed   | `0ab9aba`            | Ordered, idempotent migrations read the stored version first; newer databases refused. First migration: `predictions.attempts`.                                              |
| R4  | Fixed   | `9e62f0b`            | Every expected source listed; `ok` false for down sources, a stale feed or a stale backup; `problems` in words.                                                              |
| R5  | Fixed   | `0ab9aba`            | `BACKUP_DIR` for an off-volume copy; maintenance runs after the rebuild, not inside it; README documents the restore.                                                        |
| R6  | Fixed   | `9e62f0b`            | Healthcheck probes `/api/health` (safe now that R1 no longer depends on it).                                                                                                 |
| R7  | Fixed   | `0ab9aba`            | Retention covers terms, predictions, themes, usage; controls looked up for current items only.                                                                               |
| R8  | Fixed   | `0ab9aba`            | Bounded LRU keyed by a full-text hash; the unused public `translateTextFn` removed.                                                                                          |
| R9  | Fixed   | `0ab9aba`            | `busy_timeout`, idempotent theme insert, one alert in flight; "one replica" in README and CLAUDE.md.                                                                         |
| R10 | Fixed   | `0ab9aba`            | Usage is recorded at the end of the rebuild, after translation.                                                                                                              |
| R11 | Fixed   | `0ab9aba`            | Last-seen refreshes at most daily, so unchanged runs do not rewrite the file.                                                                                                |
| R12 | Changed | `0ab9aba`            | Not shortened: bioRxiv needs 40–60 s, a shorter timeout would lose it. Instead one fetch per source at a time and an hour cache, so the late result serves the next rebuild. |
| S1  | Fixed   | `0ab9aba`            | Failed reads retried daily (3 attempts); `unavailable`/`unmatched` counted and shown in both clients.                                                                        |
| S2  | Fixed   | `0ab9aba`            | Theme predictions keyed by day, so a comeback is judged again.                                                                                                               |
| S3  | Fixed   | `0ab9aba`            | Report labels come from every accepted theme.                                                                                                                                |
| S4  | Fixed   | `0ab9aba`            | CiNii items without `@id` identified by a title hash.                                                                                                                        |
| S5  | Fixed   | `0ab9aba`            | A prediction without a source is closed as unavailable.                                                                                                                      |
| S6  | Fixed   | `0ab9aba`            | Column comment matches the code.                                                                                                                                             |
| X1  | Fixed   | `9e62f0b`            | `ADMIN_TOKEN` when set, and one forced rebuild per 2 minutes for everyone.                                                                                                   |
| X2  | Fixed   | `9e62f0b`            | Per-source functions, `/test-parsers`, the broken harness and `/hello` removed. `9c6854d`: also `getCacheStatsFn`, `fetchFilteredFeedFn`.                                    |
| X3  | Fixed   | `9e62f0b`            | Status stays public (monitors, extension); usage and storage need `ADMIN_TOKEN` when set.                                                                                    |
| X4  | Fixed   | `f372287`            | Report cached per watch set for 5 minutes; text format cacheable.                                                                                                            |
| X5  | Fixed   | `f372287`            | Validator matches the parser (10 terms, 40 characters).                                                                                                                      |
| C1  | Fixed   | `b1809bf`            | Report saved per server and watch set; offline shows the saved copy; unreachable ≠ unavailable.                                                                              |
| C2  | Fixed   | `f372287`            | Shared watch-terms hook: chips on rows, feed filter, clickable terms in This week.                                                                                           |
| C3  | Fixed   | `f372287`, `b1809bf` | "+N/day measured" vs "≈N/day on average" in both clients; help texts updated.                                                                                                |
| C4  | Fixed   | `f372287`, `b1809bf` | "first seen" on rows and in the detail dialog.                                                                                                                               |
| C5  | Fixed   | `b1809bf`            | Extension lists discovered themes; footer shows server health (CORS added).                                                                                                  |
| C6  | Fixed   | `f372287`            | Topic rows and themes narrow the dashboard feed.                                                                                                                             |
| C7  | Fixed   | `f372287`            | Error states in Highlights, Topics and the summary; track record never a bare label; health failure shown.                                                                   |
| C8  | Fixed   | `b1809bf`            | Translated accessible names (`data-i18n-label`); info dialog labelled.                                                                                                       |
| C9  | Fixed   | `f372287`            | Report waits for hydration; loading and empty states.                                                                                                                        |
| C10 | Fixed   | `b1809bf`            | Manifest and README say thirteen sources; version 1.6.0.                                                                                                                     |
| C11 | Fixed   | `f372287`, `b1809bf` | `aria-pressed` on toggles; hints and dates visible as text.                                                                                                                  |
| C12 | Fixed   | `f372287`, `b1809bf` | Unused keys and export removed; threshold from the server; horizon from the track record.                                                                                    |
| D1  | Fixed   | `3a97b46`            | Node 22 pinned in Verify; `engines` declared.                                                                                                                                |
| D2  | Fixed   | `3a97b46`            | `scripts/smoke-store.ts` runs the store on `bun:sqlite` in CI; the image is started and `/api/health` checked before publishing.                                             |
| D3  | Fixed   | `3a97b46`            | Publish runs after Verify succeeds (`workflow_run`), builds and tags the verified commit.                                                                                    |
| D4  | Fixed   | docs                 | README, CLAUDE.md, `.env.example`, compose describe the current system, settings, security model, backups and restore.                                                       |
| D5  | Fixed   | `9e62f0b`            | `test:parsers` removed; health from real rebuilds replaces it.                                                                                                               |

Capability gaps:

| #   | Status  | Commit    | What changed                                                                                                         |
| --- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Built   | `e5b63b1` | Per topic: new works per day for 30 days and its origin, drawn as sparklines in both clients.                        |
| 2   | Built   | `4a31b66` | Discovery and theme membership also use the names in summaries.                                                      |
| 3   | Built   | `0c17d4a` | Most active makers (GitHub/HF owners) in the weekly report, both clients and the text report.                        |
| 4   | Built   | `12c8d88` | Immediate webhook alerts for server watch terms; delivered once, retried on failure, no flood on enable.             |
| 5   | Decided | docs      | Kept separate on purpose: the digest series counts blog posts, the store counts live-source items; documented.       |
| 6   | Blocked | —         | Needs credentials only the owner can create: USPTO Open Data Portal key (patents), a Reddit OAuth app, Bluesky auth. |
| 7   | Built   | `9f8ca55` | `/api/export?kind=series                                                                                             | predictions | themes&format=csv | json`. |

Found while fixing (not in the original audit): the extension's HTML
escaping left quotes intact inside attributes (fixed in `9c6854d`); on-demand
translation was an unbounded public path to the shared MyMemory quota (now
30 a minute, `9c6854d`); two more dead public server functions (removed).
