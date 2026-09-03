---
type: Reference
title: Cross-file invariants
description: Couplings that span files and are easy to break. Do not restate values from the named sources.
tags: [constraints]
status: stable
generated: { by: cursor-grok/okf, at: 2026-09-03T12:34:00Z }
stale_after: 2026-12-03T00:00:00Z
sources:
  - { id: urls, resource: /backend/planner/urls.py, title: URL aliases }
  - { id: api, resource: /frontend/src/lib/api.ts, title: Client normalizer }
  - { id: worker, resource: /backend/worker.py, title: Cloudflare WSGI entry }
  - { id: wrangler, resource: /wrangler.jsonc, title: Worker excludes }
  - { id: app, resource: /frontend/src/App.tsx, title: Simplified-then-full plan }
  - { id: assumptions, resource: /backend/planner/views.py, title: Plan assumptions }
---

Only the coupling is the knowledge. Read the named file for the actual values.

- Git folder is `spotter`; product and packages are `milemark`. Do not rename one to match the other.
- JSON over the wire is snake_case. CamelCase exists only after `normalizeTripPlan` in `frontend/src/lib/api.ts`. Do not add camelCase to Django or a second client schema.
- The browser calls `/api/v1/...`. `planner/urls.py` also keeps unversioned aliases. Do not add a third prefix.
- One Django app, two hosts: `manage.py runserver` and `backend/worker.py`. Dummy DB - no models, auth, sessions, or `django.contrib.*` already excluded in `wrangler.jsonc`.
- First plan uses `route_overview=simplified`. `full` is a second request from `App.tsx`. Do not default OSRM to full.
- HOS limits in `scheduler.py`, `ASSUMPTIONS` in `views.py`, and the trip-form helper line must change together.
- No breaking API or UI changes unless explicitly requested.
