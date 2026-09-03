---
type: Reference
title: Source map
description: Which files to open for a task. Pointers only; no copied contents.
tags: [orient]
status: stable
generated: { by: cursor-grok/okf, at: 2026-09-03T12:34:00Z }
stale_after: 2026-12-03T00:00:00Z
sources:
  - { id: readme, resource: /README.md, title: README }
  - { id: planner, resource: /backend/planner/, title: Planner package }
  - { id: web, resource: /frontend/src/, title: Web app }
---

Open these instead of scanning the repo. Details live in the files.

| Task | Open |
|------|------|
| Run, test, deploy | `README.md`, root `package.json` |
| Plan HTTP | `backend/planner/views.py`, `urls.py`, `validation.py`, `errors.py` |
| HOS timeline / logs payload | `backend/planner/scheduler.py` |
| Geocode / OSRM | `backend/planner/routing.py` |
| Worker / Django host | `backend/worker.py`, `backend/server/settings.py`, `wrangler.jsonc` |
| Client contract | `frontend/src/types/trip.ts`, `frontend/src/lib/api.ts` |
| Plan UX | `frontend/src/App.tsx`, `components/trip-form.tsx`, `components/trip-results.tsx` |
| Map / printable logs | `components/route-map.tsx`, `components/daily-log-sheet.tsx` |
| Tests | `backend/planner/tests/`, `frontend/src/**/*.test.*` |
