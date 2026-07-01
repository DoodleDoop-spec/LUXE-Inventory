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

- **Iteration 4**:
  - **Hierarchical locations** (unlimited depth) via `parent_id`. New endpoints: `PUT /api/locations/{id}` rename, DELETE 409 if it has children. Locations page + Settings use a shared `LocationTree` component (inline + / rename / delete + expandable rows with per-location costumes).
  - **Shows** collection with year: `GET/POST/PUT/DELETE /api/shows`. Managed in Settings. Costume gets `creator`, `original_show_id`, `additional_show_ids`, and denormalized `origin_year`. Editing a show's year re-syncs origin_year on all costumes using it.
  - **Removed** `last_year_used`. New default sort = `origin_year_asc` (nulls last); options: `origin_year_desc`, `updated_desc`, `name_asc`, `total_desc`, `system_size`.
  - Inventory filters + sort collapsed by default (toggle-filters-btn / toggle-sort-btn); **removed** size + sizing_system filters.
  - List view: image thumbnail column left of name (with placeholder icon when no image).
  - Search bar X-clear (global + local).
  - **LUXE logo** in header (`/assets/logo.webp`), Dashboard hero: "LUXE Inventory Management System".

- **Iteration 5**:
  - Locations page is now **view-only** (click a tree node → contents on right); nesting/edit moved fully to Settings.
  - **Nested subcategories** (unlimited depth) — categories store `[{id, name, parent_id}]`. Auto-migrates legacy string subcategories on read. Full CRUD + tree editor in Settings; cascading picker in the costume form; regex-prefix filter includes descendants.
  - **Shows grouped by year** in Settings (accordion). Show model gained `image_id` + `notes`; edit form uploads a photo used by the app.
  - New **Shows tab** (`/shows`) + per-show detail (`/shows/:id`) listing originals + additional costumes with photos.
  - Inventory: added **filter-year** and **filter-show**; removed `system_size` sort.
  - Hardening: PUT `/api/shows/{id}` now 409s on name+year collisions; subcategory-prefix regex is escaped safely.

- **Iteration 6 (bug fix + polish)**:
  - **BUG FIX**: nested subcategory creation returned "Parent subcategory not found". Root cause: legacy string-subcategories were normalized on read but not persisted, so client-visible IDs kept regenerating. Fix: `list_categories` now persists normalized shape when it detects legacy strings, and `add_subcategory` persists before parent-id validation. Verified with direct-DB reproducer.
  - Removed "INDEX NN /" text from all page eyebrows.
  - Renamed **All Costumes → All Inventory**; nav & dashboard stat icon switched from Shirt → Package (inclusive of accessories added as a category).
  - Shows page: replaced `gap-px bg-[#E4E4E7]` grid seams with `gap-6` + per-card borders — no more grey box under each year.
  - Default costume sort is now **`origin_year_desc` (Most recently used)** on both Inventory and the Dashboard "Most recently used" section. Sort labels simplified (Most recently used / Oldest first / Recently updated / Name A→Z / Total qty ↓).

## Status
- Backend: 17/17 pytest tests pass (iter-5 + iter-6)
- Frontend: 100% of iter-6 spec verified by testing agent

## Backlog (Next)
- P1: Bulk import (CSV) / export costumes
- P1: Multi-photo per costume + gallery view
- P2: Check-out / check-in tracking (who has the costume)
- P2: Low-stock alerts and per-size thresholds
- P2: Tagging/labels (e.g. show, season)
- P2: Activity log / audit trail
- P3: Lifespan context manager migration (FastAPI deprecation)
- P3: Async storage HTTP client (httpx) instead of `requests`
