# Milemark

HOS-aware trip planner for property-carrying drivers. Enter current location, pickup, drop-off, and cycle hours. The app returns a route, required stops, and printable daily log sheets.

Django API + React (Vite, shadcn/Geist). Hosted as a Cloudflare Worker: static frontend plus `/api/*`.

Live: https://milemark-eld-planner.altaaryan.workers.dev

## Run locally

```sh
uv sync
npm install
npm run dev
```

API: `http://127.0.0.1:8000`  
Web: `http://127.0.0.1:5173` (proxies `/api` to Django)

```sh
npm test
npm run lint
```

## Deploy

Wrangler must already be logged in.

```sh
npm run deploy
```

That builds the frontend, then `uv run pywrangler deploy`.
