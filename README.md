# Milemark

HOS-aware trip planner for property-carrying drivers. Enter current location, pickup, drop-off, and cycle hours. The app returns a route, required stops, and printable daily log sheets.

Django API + React (Vite, shadcn/Geist). Hosted as a Cloudflare Worker: static frontend plus `/api/*`.

Live: https://milemark-eld-planner.altaaryan.workers.dev

Agent knowledge (OKF): [knowledge/index.md](knowledge/index.md) — catalog only; do not dump the folder.

## Run locally

```sh
uv sync
bun install
bun dev
```

API: `http://127.0.0.1:8808`  
Web: `http://127.0.0.1:5179` (proxies `/api` to Django)

```sh
bun run test
bun run lint
```

## Deploy

Pushes to `main` deploy via GitHub Actions. Add a `CLOUDFLARE_API_TOKEN` repo secret (Cloudflare dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers**).

To deploy locally, Wrangler must already be logged in:

```sh
bun run deploy
```

That builds the frontend, then `uv run pywrangler deploy`.
