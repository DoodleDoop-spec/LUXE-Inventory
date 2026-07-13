# LUXE Inventory Management — PRD

## Original problem statement
A proprietary internal tracking system for costumes/accessories with location tracking, total quantity, size-specific quantity, and easy search/inventory management for non-technical team members.

## User personas
- **Wardrobe manager** — primary user; adds, edits, flags costumes; manages storage locations, shows and flag types.
- **Assistant / helper** — searches inventory, moves items via drag & drop, checks what is flagged or in use.

## Core requirements (stable)
- Track costumes / accessories with sizes, quantity per size, hierarchical storage locations, hierarchical categories, and shows they appear in.
- Non-coding management of taxonomy (categories, subcategories, sizing systems, storage tree, shows, flag types).
- Robust search and sort (keywords, name, category, location, origin year).
- Drag & drop reorganisation. Color coding. Multi-flag system. Currently-in-use awareness.

## Implemented (running log)

### Iteration 1–7 (baseline)
- FastAPI + MongoDB backend, React + Tailwind + shadcn/ui frontend.
- CRUD: Costumes, Categories (with nested subcategories), Locations (hierarchical tree), Shows (grouped by year), Groups (variants), Sizing systems, Settings.
- Costume form with sizes + per-size notes, keywords, creator, original show, additional shows, group + variant label.
- Inventory grid/list with filters, sort by origin year.

### Iteration 8 — Feb 2026
- Dynamic branding (org name + logo).
- Flag system (multi-flag per costume, /flags tab).
- Add-Show + attach-costumes UX.
- Color-coded categories.
- Costume `buy_link` + Show `show_link`.
- Wording sweep to "costumes / accessories".
- Drag & drop on Inventory.

### Iteration 10 — Jul 2026 (this session)
- **Category ↔ Group merge (backend layer)**: Categories and Subcategories now carry `image_id`, `location`, `sub_location`, `notes`, `keywords`, `creator`. API endpoints (`PUT /categories/{id}`, `POST/PUT /categories/{id}/subcategories`) accept and persist these. Subcategories can be nested and each can act like a "group" (image + location + notes) — Q1c.
- **Costume shows revamp**: Removed `original_show_id`; costumes now carry `shows: [{show_id, timestamp}]` with per-costume timestamps. Origin year is derived as MIN(show.year) across attached shows. Legacy fields are read but no longer written; a startup migration back-fills the new field from legacy data.
- **Show model**: `link_timestamp` was removed from Show. Video timestamp is now purely per-costume. Show still has `show_link`; the costume form lets each costume edit that link inline if it's missing.
- **Sizing → Sorting system**: renamed the concept everywhere in the API (`sorting_system` field on Costume) and UI (labels, testids). Both legacy `sizing_system` and new `sorting_system` are accepted in payloads. `/api/sorting-systems` endpoints alias `/api/sizing-systems`. Users can create a new sorting system inline from the costume form ("Colors", "Rings", etc.).
- **Dashboard**: 8 clickable tiles — Total Pieces (→ /inventory), Total Quantity (→ /inventory), Equipment (→ /equipment), In Use (→ /inventory), Categories (→ /settings), Storage Locations (→ /locations), Shows (→ /shows), Flagged (→ /flags). Hover reveals a "VIEW →" hint.
- **Equipment tab**: New nav item next to Inventory with a `/equipment` stub page ("Coming soon"). Backing `equipment_count` stat is 0 for now.
- **Startup migrations**: rename `sizing_system` → `sorting_system` on costumes, build `shows` list from legacy fields, unset `link_timestamp` from all shows.
- Removed "New Group" button and Groups strip from Inventory (superseded by category grouping).

### Iteration 9 — Feb 2026 (this session)
- **Inline entity creation from Costume form** — create new subcategory, storage location, or show without leaving the modal. Similar-category detector shows one-click "Use existing X" chips when a fuzzy match is found.
- **Collapsible global search** — magnifying-glass icon expands into a search input; auto-collapses when empty.
- **Image attachments in notes and per-flag notes** — multiple images per costume note and per attached flag; previewed inline on CostumeDetail.
- **Video-timestamp support** — Show has `link_timestamp` (accepts `HH:MM:SS`, `MM:SS`, or seconds). ShowDetail "Watch this show" link auto-rewrites for YouTube (`?t=Xs`) and Vimeo (`#t=XmXs`).
- **Currently in use** state — per-costume toggle + optional note + timestamp. Dashboard shows a green "IN USE" tile + section, inventory cards get an in-use badge, detail view gets a green banner.
- **Category merge** — Settings has a merge tool: pick a keeper and a donor category; all costumes are migrated and the donor is deleted.
- **Legacy-flag migration** — one-click migration in Settings converts old `is_flagged` costumes into a `Legacy` flag category.
- **Duplicate-category suggestion** — inline warning when adding a new category with a name similar to an existing one.
- **Mobile polish** — hamburger nav on <md screens with a mobile drawer, responsive main content padding, collapsible search icon on all breakpoints.
- **Deduplicated category dropdowns** — legacy duplicate-name categories no longer crash Radix Select.

## Backlog

### P0 — none pending
### P1
- **Image editing** (crop / rotate) inside upload flow.
- **Batch actions** on inventory list (bulk assign, bulk flag, bulk in-use).
- **Print / share** a show's costume manifest.
- **Persistent filters** (URL sync) on Inventory.

### P2
- Backend router split (`server.py` ~1500 lines).
- Hex validation on category color.
- Debounce `/categories/similar` on server side.
- Aggregation-pipeline delete for flag category cascade.

## Test status
- Iteration 9 backend: 35/35 pytest tests passing (8 new for this iteration, on top of iter-8's 27).
- Iteration 9 frontend: all key testids verified live via Playwright at desktop and mobile viewports.
- No known blocking issues.

## Test credentials
None required (no auth).
