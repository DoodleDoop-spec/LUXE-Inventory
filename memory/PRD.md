# Costume Inventory Tracker — PRD

## Original Problem Statement
Create a functional app for a proprietary internal tracking system designed for costumes,
which includes features such as location tracking, total quantity, and size-specific quantity
of each costume, allowing team members to easily search for costumes and manage inventory
without the need for coding experience.

## User Choices
- Authentication: None (open access for team)
- Costume fields: name, category, location, total quantity, size-specific qty (XS/S/M/L/XL), photo upload
- Locations: predefined list + free-text
- Extra features: none (keep simple)
- Design vibe: Clean & Professional (Swiss/High-Contrast)

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async). All routes under `/api`.
- **Frontend**: React + Tailwind + Shadcn UI, React Router. Vanilla JS (no TS).
- **Object Storage**: Emergent object store via `EMERGENT_LLM_KEY` for costume photos.

## User Personas
- **Wardrobe / Costume Manager**: maintains the inventory, adds/updates costumes, manages locations.
- **Team Member**: searches and views costumes; consults size and location info.

## Core Requirements (Static)
- Add/Edit/Delete costumes
- Track sizes XS/S/M/L/XL with total = sum
- Free-text or predefined location
- Photo upload per costume
- Search by name/category/location; filter by category, location, size availability
- Dashboard with summary statistics
- Manage list of predefined locations

## Implemented (Feb 2026)
- **Iteration 1**:
  - Backend: `GET /api/stats`, `GET/POST/PUT/DELETE /api/costumes`, `GET /api/costumes/{id}`, `GET/POST/DELETE /api/locations`, `GET/POST /api/categories`, `POST /api/upload`, `GET /api/images/{id}` (via Emergent object storage), seed defaults on startup.
  - Frontend: Dashboard, Inventory (grid+list, filters), Costume Detail, Locations, `CostumeFormDialog`.
- **Iteration 2**:
  - Sizes extended to `XS/S/M/L/XL/XXL/XXXL`.
  - `sub_location` field on costumes (preset + sub-location combo).
  - Per-size notes (`size_notes` dict on costume).
  - Flag/Unflag costumes with reason (`is_flagged`, `flag_reason`, `flagged_at`). Endpoints: `POST /api/costumes/{id}/flag`, `POST /api/costumes/{id}/unflag`, `GET /api/flagged`. Flagged filter in inventory + banner on dashboard + detail page.
  - Removed size distribution from Dashboard, replaced with Flagged tile.
  - Locations page: expandable rows showing costumes in each location + orphan (custom) locations section. New `GET /api/locations/costume-counts`.
  - Settings tab (`/settings`) with org name, default view (grid/list), show flag banner toggle, category CRUD. `GET/PUT /api/settings`. `DELETE /api/categories/{id}` (409 if in use).

- **Iteration 3**:
  - `last_year_used` (integer) on costume + new sort options (`last_used_asc/desc/name_asc/total_desc/system_size`).
  - Dynamic **sizing systems** — 4 seeded (Letter, Number (Even), Tall, Petite); costume chooses one. `GET/POST/PUT/DELETE /api/sizing-systems`. Sizing system CRUD in Settings; can't delete if in use.
  - **Keywords** array on costumes with chip UI; search `q` matches keywords in addition to name/category/location/notes.
  - **Global search bar** in the header (leftmost); submitting jumps to `/inventory?q=`.
  - **Subcategories per category**: `GET /api/categories` returns `subcategories[]`; `POST/DELETE /api/categories/{id}/subcategories`; Settings has expandable rows to manage.
  - Inventory: filter by subcategory and sizing system; new sort dropdown.

## Status
- Backend: 31/31 pytest cases pass
- Frontend: All spec'd flows and testids verified via Playwright

## Backlog (Next)
- P1: Bulk import (CSV) / export costumes
- P1: Multi-photo per costume + gallery view
- P2: Check-out / check-in tracking (who has the costume)
- P2: Low-stock alerts and per-size thresholds
- P2: Tagging/labels (e.g. show, season)
- P2: Activity log / audit trail
- P3: Lifespan context manager migration (FastAPI deprecation)
- P3: Async storage HTTP client (httpx) instead of `requests`
