# Local Docker verification

Use the repository Dockerfile and Compose service with the fixture override.
Choose an unused Compose project name and localhost port; preserve existing
containers and volumes. The override uses a dedicated QA image, a project-owned
history volume, one CPU and 512 MiB of runtime memory. It clears paid keys and
webhook settings. `scripts/qa/server.ts` intercepts every upstream fetch, returns
synthetic responses and refuses unknown URLs; it never forwards requests.

```sh
docker context inspect
docker ps -a
docker compose -p techradar-local-qa -f docker-compose.yml -f scripts/qa/compose.override.yml build
docker compose -p techradar-local-qa -f docker-compose.yml -f scripts/qa/compose.override.yml up -d
docker compose -p techradar-local-qa -f docker-compose.yml -f scripts/qa/compose.override.yml ps
```

Open `http://localhost:43177`. Set `QA_PORT` before building and starting to
choose another port; the same address is baked into the extension package.
The fixture entry imports the image's production `server.ts` and built SSR
handler. It uses `/app/.cache/history.db` on the Compose volume. Its scheduler
runs every 30 seconds and creates the daily backup without page traffic.

Expected fixture results:

- `/api/extension-feed`: 11 items from GitHub, arXiv, Hacker News and HAL;
  markup/entities cleaned; one work linked across three sources.
- `/api/health`: all 13 sources listed; HAL names its discarded invalid date;
  bioRxiv/medRxiv name their HTTP 200 empty-body failures. Other empty fixtures
  show degraded/down source status. The container readiness check remains
  healthy; `/api/health?strict=1` returns 503 for these intentional outages.
- `/api/report?watch=fixture`: fixture mentions and cross-source works.
- `/api/export?kind=predictions&format=json` and `&format=csv`: stored history;
  an invalid export kind returns 400.
- After `docker compose ... restart`, the 11 item identities, first-seen dates,
  observations and daily backup remain on the same project-owned volume.

Browser checks cover RU/EN switching, returning saved RU after reload,
translation then sort/filter, mobile layout, keyboard modal focus and extension
download/retry. Server timestamps are UTC and number formatting uses an
explicit locale, so a Linux container and a browser in another timezone render
the same initial text.

For offline tests in the same Linux build environment:

```sh
docker build --target build -t techradar-local-qa-build .
docker run --network none --cpus 1 --memory 1g techradar-local-qa-build sh -c 'bun run typecheck && bun run test -- --maxWorkers=1 && bun run lint && bun run format:check && bun run scripts/smoke-store.ts && bun run check:secrets'
```

One test worker avoids CPU-throttling interference with the text-parser
performance assertion. Keep that assertion intact. Runtime-only images omit
dev dependencies, so run this command against the build stage.

The extension package is `/app/dist/extension/tech-radar-extension.zip`; its
unpacked files are under `/app/dist/extension/unpacked`. Browser QA can serve
those files over local HTTP with the documented localStorage fallback.
Installing MV3 into a real Chrome profile is a separate verification step.

These fixtures verify the container pipeline, persistence and accessible UI;
they do not verify current availability of every public upstream, paid Jev or
Claude output, external webhook delivery, or 14-day track-record accuracy.
They must not be used as a production data source. Never point the QA project
at an existing history volume.
