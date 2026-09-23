# Deploying TechRadar

TechRadar is one container: a Bun server that serves the dashboard, the API
the Chrome extension reads, and a background schedule that rebuilds the feed
and keeps the history. Whatever the platform, the requirements are the same:

| Requirement                    | Why                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| **One instance**               | The history is a SQLite file and caches live in memory. Two replicas would record and alert twice. |
| **A volume at `/app/.cache`**  | Holds the history, the Jev verdict cache (a redeploy re-sends nothing) and the daily backups.      |
| **Port `PORT`** (default 3000) | HTTP; put HTTPS in front of it (the platform's, or Caddy on a VPS).                                |
| **`ADMIN_TOKEN`**              | Required on anything reachable from the internet (operator actions and usage data).                |
| **Always on**                  | The schedule runs inside the server; a platform that sleeps idle services stops the history.       |

Optional configuration (all server-side, never in the extension or the
repository): `TYPESAFE_API_KEY` (Jev — without it items are unclassified and
ranked from engagement only), `GITHUB_TOKEN`, `MYMEMORY_EMAIL`,
`OPENALEX_MAILTO`, the webhooks `REPORT_WEBHOOK_URL` / `WATCH_WEBHOOK_URL` /
`ALERT_WEBHOOK_URL` with `REPORT_WATCH`, and `BACKUP_DIR`. See `.env.example`.

The image is published to `ghcr.io/lazarevtill/techradar:latest` after CI
passes on `main`; building from the repository works everywhere too.

After any deployment, check it the same way:

```bash
curl -fsS https://radar.example.com/api/health   # "ok": true once sources have run (first rebuild ~1 min)
curl -fsS "https://radar.example.com/api/health?strict=1" -o /dev/null -w '%{http_code}\n'   # 200
```

Then open the dashboard, and in the extension's Settings set the server to
`https://radar.example.com` and press "Test connection".

---

## VPS over SSH (Docker Compose + Caddy)

Any Linux server with Docker Engine and the Compose plugin (v2.24 or newer),
a domain whose DNS `A`/`AAAA` record points at the server, and ports 80 and
443 open. `deploy/vps/` adds Caddy for automatic HTTPS, keeps the app off the
public ports, and writes backups to `./backups` on the host — outside the
data volume, so losing the volume does not lose them.

```bash
ssh user@server

# Docker (skip if installed): https://docs.docker.com/engine/install/
git clone https://github.com/lazarevtill/TechRadar.git
cd TechRadar

cp deploy/vps/.env.prod.example .env
# Edit .env: DOMAIN, EXTENSION_BACKEND_URL, ADMIN_TOKEN (openssl rand -hex 32),
# and the optional keys. .env is gitignored; never commit it.
chmod 600 .env

docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml ps
```

Caddy obtains the certificate on the first request to the domain. HTTP
redirects to HTTPS.

**Update** to the latest `main`:

```bash
cd TechRadar && git pull
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml up -d --build
```

The history database migrates itself on start; a database written by a newer
build is refused (the server then runs without history and says so in its
log) rather than downgraded.

**Logs:** `docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml logs -f techradar`
(`[scheduler]`, `[history]`, `[discovery]`, `[health]` lines).

**Backups** land in `~/TechRadar/backups/history-YYYY-MM-DD.db` (newest 7
kept). Copy them off the server as well, e.g. from your machine:
`rsync -a user@server:TechRadar/backups/ ./techradar-backups/`.

**Restore** a backup:

```bash
C="docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml"
$C stop techradar
$C run --rm --no-deps --entrypoint sh techradar -c \
  'cp /backups/history-2026-09-23.db /app/.cache/history.db && rm -f /app/.cache/history.db-wal /app/.cache/history.db-shm'
$C start techradar
```

**Firewall** (ufw example): allow 22, 80, 443 only. The app's port 3000 is
not published by the overlay.

---

## Railway

The repository contains `railway.json` (Dockerfile build, deploy-time
healthcheck on `/api/health`, restart on failure).

1. **New project → Deploy from GitHub repo** → pick the repository (or your
   fork). Railway detects `Dockerfile` and `railway.json`.
2. **Volume:** service → _Settings_ → _Volumes_ → add a volume with mount path
   **`/app/.cache`**. A service with a volume runs a single instance, which is
   what TechRadar needs.
3. **Variables** (service → _Variables_):
   - `RAILWAY_RUN_UID=0` — the image runs as a non-root user, and Railway
     volumes are otherwise not writable for it.
   - `ADMIN_TOKEN`, and whichever optional keys you use (`TYPESAFE_API_KEY`,
     `GITHUB_TOKEN`, webhooks, …).
   - `EXTENSION_BACKEND_URL=https://<your-domain>` — the default server
     baked into the downloadable extension (a build argument: Railway passes
     service variables to the `ARG` of the same name).
   - Leave `PORT` to Railway.
4. **Networking:** _Settings_ → _Networking_ → generate a domain (HTTPS is
   automatic) or add your own.
5. Deploy, then run the checks at the top of this page.

Notes: Railway's healthcheck runs only while deploying (it waits up to 120 s
here for the server to answer); for ongoing monitoring point an uptime
checker at `/api/health?strict=1`. Railway's own volume backups can be
enabled on the volume; the app's daily copies stay on the same volume unless
you point `BACKUP_DIR` elsewhere. Do not add replicas.

---

## Other platforms

Any platform that runs a Dockerfile with **one** always-on instance and **a
persistent disk mounted at `/app/.cache`** works:

- **Fly.io** — a Fly volume mounted at `/app/.cache` in `fly.toml`, one
  machine, `auto_stop_machines` off (the schedule must keep running).
- **Render** — a Docker web service with a persistent disk at `/app/.cache`
  (a service with a disk runs one instance); a paid instance type, since free
  services sleep.
- **Kubernetes** — a single-replica `StatefulSet` (or a `Deployment` with
  `replicas: 1` and `strategy: Recreate`) with a `PersistentVolumeClaim` on
  `/app/.cache`; probe `/api/health`.

What does **not** work: serverless or scale-to-zero platforms (no background
schedule, no persistent disk), and more than one instance per volume.

If the platform runs containers as a user other than uid 1000, make the
volume writable for it (the image's `bun` user is uid 1000).
