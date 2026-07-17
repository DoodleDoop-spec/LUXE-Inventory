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

### Iteration 12 — Jul 2026 (this session)
- **Equipment inventory**: Full CRUD sibling to costumes with its own categories & sorting systems. Backend: `equipment`, `equipment_categories`, `equipment_sorting_systems` collections. New endpoints under `/api/equipment`, `/api/equipment-categories`, `/api/equipment-sorting-systems`, plus `/api/equipment-stats` and `/api/equipment/pinned`. Frontend: new `Equipment.jsx` page with category accordion, `EquipmentFormDialog.jsx` with all the polish (image upload, sorting-system-none flow, keywords, in-use/pin toggles, inline category creation).
- **Sorting-system display fix**: When a costume/equipment has no sorting system, the size grid + "SYSTEM · Letter" label are hidden. Instead the card shows a big "QUANTITY: N" number.
- **Storage location maps** (labelable): Every location gets one of three modes:
  1. `none` — no map (default)
  2. `photo` — upload a photo (e.g. of a rack); click anywhere to drop numbered pins with editable labels + color; drag to reposition
  3. `floorplan` — top-down room layout editor. Tools: **rectangle** (racks/tables), **circle** (round tables/columns), **line** (walls/dividers), **text label**. Click-to-place, click-to-select, drag-to-move, corner-drag to resize. SVG canvas with a light grid. Selected shape reveals fill-color palette + label input + delete button.
- **Boxed collapsible sections**: New reusable `CollapsibleBox` component (accent color left bar, chevron toggle, icon, title/subtitle, right-hand actions). Applied to Categories and Sorting Systems lists in Settings so they now match the Flags visual pattern and are collapsed by default.
- **Maintenance tab removed**: The old "Migrate legacy flags" tab is gone from Settings. Data migrations continue to run automatically on backend startup.
- New route `/locations/:id/map` with a "View / edit map" button surfaced on the Storage page.

### Iteration 11 — Jul 2026 (this session)
- **Costume form bug fix**: Reset useEffect now depends only on `[open, editing?.id]` — prop refetches (locations/categories/shows after inline creation) no longer wipe user input. Inline subcategory creation auto-selects the new sub without losing other fields.
- **Sorting system is optional**: New "— None (single total) —" option. When selected, the sizes grid hides and a single TOTAL QUANTITY input replaces it. Persisted via `total_quantity_override` on the API.
- **In-page confirm dialogs**: All `window.confirm` calls replaced by a promise-based `useConfirm()` powered by shadcn AlertDialog. Reusable across Inventory / Costume detail / Show detail / Settings / Flags.
- **Current show on in-use costumes** (max 2 active): When toggled to in-use, a dropdown appears to pick one of the costume's attached shows as the current one. Backend enforces a cap of 2 distinct current shows (`_enforce_current_show_cap`). Shows with any in-use costume attached now show a green blinking "LIVE" badge on the Shows page.
- **Edit / delete show**: `ShowDetail` gets an "Edit show" button that opens an in-place dialog (name, year, cover photo, watch link, notes) and a "Delete" button (guarded by the confirm dialog + backend "in use" check).
- **Prominent "remove costume from show" button**: The X on each costume card in a show is now always visible (was hover-only).
- **Settings tabs**: Reorganized into 6 tabs — General, Storage, Categories, Sorting Systems, Shows, Maintenance.
- **Fixed show_flag_banner**: Dashboard now honors the setting (previously the flag banner always showed).
- **3-way in-use visibility**: Settings > General has "Show everything / Hide markers only / Don't spoil the surprise!" toggle. `hide_all` shows a locked banner with "Don't spoil the surprise! 🤫" instead of the in-use list; `hide_marker` keeps the section but drops the green "IN USE" tags on cards.
- **Pinned costumes**: New `pinned: bool` field on costumes; toggle in the form. Dashboard shows pinned first (up to 8), falls back to "Most recently used" when nothing is pinned. Pinned items show a yellow star badge.
- **Live org name + logo**: New `SettingsContext` broadcasts settings; Layout and Dashboard consume it. Saves from the Settings page propagate immediately without a page refresh.
- **Inventory category accordion**: Grid view now groups costumes by category into collapsible sections (chevron, category color swatch, piece/unit count). Each section can be collapsed independently.
- **Migration**: startup migration keeps working (rename sizing→sorting, backfill shows). Any legacy costume that had sorting_system="Letter" but no chosen sizes still functions.

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
