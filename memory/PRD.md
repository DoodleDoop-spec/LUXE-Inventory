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

### Iteration 15 — Jul 2026 (this session)
- **Drag-and-drop move in Locations**: Items in the "CONTAINED" panel are now draggable. Drop one onto a location in the tree — it re-assigns that item's location on the server AND auto-removes any old-map pin/shape that was referencing that item. Backend: `POST /api/locations/move-item {item_id, item_type, new_location, new_sub_location}`.
- **Equipment settings tab**: New "Equipment" tab in Settings for managing equipment-specific Categories and Sorting Systems.
- **Coat-hanger icon for Costumes nav**: New `HangerIcon` component (inline SVG hanger) replaces the box icon on the "Costumes" tab.

### Iteration 13 — Jul 2026 (this session, bug fixes)
- **Line rotation full 360°**: The floorplan line shape can now be freely rotated in any direction. Fixes: (a) lines now render two draggable endpoint circles (small black dots at both ends) when selected — drag either end anywhere on the canvas; (b) the resize deltas no longer clamp negative values for lines (they do still clamp for rects/circles which need positive dimensions).
- **Sublocation linking on maps**: Both photo pins and floorplan shapes gained a `location_id` field. The property panel now shows a "LINK TO SUBLOCATION" dropdown listing this location's direct children. Once linked, the shape/pin gets a small 🔗 marker and can be opened by (a) double-clicking the shape/pin on the canvas or (b) clicking "→ Open this sublocation's map" in the property panel. Backend `MapPin` and `MapShape` models updated accordingly.
- **Default collapse fixes**: (a) Flags list default state flipped to collapsed. (b) Inventory + Equipment categories now default to collapsed — expand-on-click. (c) Shows-by-year sections in Settings default to collapsed.
- **hide_in_use_mode extended to Inventory**: The setting now also controls the "IN USE" badge on Inventory cards. `hide_marker` mode drops the badge; `hide_all` mode hides the card entirely.
- **Dialog X always reachable**: `CostumeFormDialog` and `EquipmentFormDialog` restructured to `flex flex-col max-h-[90vh] overflow-hidden` with a non-scrolling sticky header + scrolling body. The X button now stays fixed at the top-right regardless of scroll position.

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

### Iteration 21 — Feb 2026 (Round D: wardrobe kanban + student filters + CSV import)
- **Wardrobe Kanban** — new top-level nav tab (`/wardrobe`) that renders every in-use costume grouped as a column per student. Header stat strip: Students on stage / Costume assignments / Live shows / Unassigned in-use. Filters for search, show, and student category. Unassigned in-use costumes (no `assigned_student_ids`) surface in their own bucket at the bottom so nothing gets lost. Costume tiles link straight to the detail page and show category, sub-location, and a green LIVE chip when a current show is set.
- **Student sort + filter** — Students page gains a category dropdown (`All categories` / `No category` / each named), a sort dropdown (`Name` / `Grade` / `Category`), and the search bar was slimmed to 224px so all three controls fit. `useMemo` composes search → category → sort so state changes are cheap.
- **CSV import for Students** — `POST /api/students/import` accepts a `rows[]` payload with optional `dry_run` and returns `{ created, would_create, duplicates, invalid, preview[] }`. Duplicates use case-insensitive first+last name; `category_name` maps to `category_id` via a name lookup. Front-end: two-click flow (parse CSV in-browser → dry-run preview via `window.confirm` → real import). Included a `Download` icon-only button that generates a template CSV with dynamic `size:<system>` and `m:<measurement>` columns based on the org's sorting systems.
- **Nav** now includes a `Wardrobe` item between Students and Shows; gated by `costumes.view` so student-role users don't see it if their permissions don't allow it.

### Iteration 20 — Feb 2026 (Round C: student categories + in-use polish + director handoff)
- **Student sorting system (student categories)** — new `student_categories` collection with `{id, name, color, description, org_id}`. Directors manage them via a `Palette`-icon `Categories` dialog on the Students page: name + 10-swatch color palette + CRUD list. `student.category_id` is optional, editable in the student form, and displayed as a colored **top-left badge** on every student card (matches the flag/in-use marker pattern). `DELETE /api/student-categories/{id}` also untags every student that referenced it.
- **In-Use marker color parity** — dashboard `IN USE` marker changed from `bg-[#10B981]/90` to solid `bg-[#10B981]`, matching the In-Use section's border/eyebrow color exactly (with the section's `#ECFDF5` background retained for reading contrast).
- **In-Use toggle simplified** — the tri-state (`Show everything` / `Hide markers only` / `Don't spoil…`) is gone. Now a single Switch in Settings › General: `SHOW IN-USE BANNER ON DASHBOARD`, mirroring the flag toggle. Internally the setting flips `hide_in_use_mode` between `"full"` and `"hide_all"` so the existing dashboard logic keeps working.
- **Director Handoff** — new `POST /api/organizations/transfer-director {new_director_user_id, step_down_to_role_id?}` promotes the target to Director, steps the caller down to Assistant Director (fallback: Costumes Manager), and clears the caller's `is_superadmin` flag. Only the current Director (or super-admin) may call it. Verified end-to-end via curl: admin → invitee, then invitee → admin. Settings › Organization renders a `Crown` icon next to every non-Director member (visible only to the current Director) that fires a confirmation dialog and reloads the page after transfer so the caller's own permissions refresh.
- **Role backfill safety net** — `GET /api/roles` now migrates any unowned roles into the Default Org on demand so historical fresh-install DBs never end up with orphaned Director/Assistant-Director slots that break org lookups.

### Iteration 19 — Feb 2026 (Round B: restructure + permissions + student sizing + in-use quantity)
- **Shows / Storage header spillage fix** — reduced `xl:text-6xl` → `sm:text-5xl` and switched to `flex-col md:flex-row` so the Add-button no longer collides with wrapped descriptions.
- **Nested Settings tabs** — `Categories` and `Sorting Systems` top-level tabs replaced with two new top-level tabs: **Costumes** and **Equipment**, each containing internal `Categories` and `Sorting Systems` sub-tabs. `EquipmentTaxonomySection` refactored to render the same nested pattern.
- **Permission-Aware UI** — nav items and Settings sub-tabs are filtered through `useAuth().hasPerm()`. Nav items declare a `perm` key (e.g. `costumes.view`) and the top nav (desktop + mobile) hides any item the current role isn't granted. Settings hides Costumes/Equipment when the role lacks `taxonomy.edit`, Roles when it lacks `roles.edit`, and Organization when it lacks `users.invite` / `users.manage_roles` / `settings.edit`. Verified: a `Student` role sees only Dash / Costumes / Shows / Settings-with-General-only.
- **Student sizing → org Sorting Systems** — student sizes editor replaced with one dropdown per org sorting system, each defaulting to `— N/A —` and offering the system's own values. Free-form measurements still live alongside for chest/waist/height style numbers.
- **Link map shape / pin to a costume** — Floorplan editor properties panel now has a `LINK TO COSTUME` dropdown alongside sublocation linking. Selecting a costume auto-fills the shape's label with the costume name (when it hasn't been customized) and offers a "→ Open costume detail" jump. Backend already supports `item_type` + `item_id` on shape/pin docs.
- **In-Use qty + student assignment + Free counter** — Costume model gains `in_use_quantity: int` and `assigned_student_ids: List[str]`. Create + Update endpoints clamp `in_use_quantity` to `total_quantity` and reset both on `in_use=false`. The Inventory card now displays `<green>N</green> in-use · <black>M</black> free` when a costume is in use. The Costume Create/Edit dialog exposes a numeric qty input, a live Free counter, and a scrollable student checklist. Verified end-to-end via curl (turn ON → qty=1, students=[…]; turn OFF → qty=0, students=[]).

### Iteration 18 — Feb 2026 (Round A: UI polish)
Quick UI polish batch ahead of the bigger permission-aware / import / director-handoff work:
- **Nav shrunk + Dashboard → Dash** — main nav tab height and padding trimmed (`px-2.5 py-1.5`, gap `0.5`, `text-[13px]`, `h-3.5` icons). "Dashboard" label renamed to "Dash".
- **HangerIcon fix** — redrawn to fill the 24-viewBox properly (hook centred, bar spans 2–22 x 12–19 y) so the Costumes tab icon no longer feels clipped at small sizes.
- **Per-flag colored icons** — new `/lib/flagColor.js` helper picks the first attached flag category's color. Inventory grid + table + Dashboard costume tiles + Dashboard flagged section all render the Flag glyph tinted with that colour (plus a matching left stripe on each flagged row). No more universal red.
- **In-app prompt dialog** — new `<PromptProvider>` + `usePrompt()` hook replaces every `window.prompt()` / `window.confirm()` in the app (Students "Add measurement/size", GroupDetail delete). Wired through `App.js` alongside `<ConfirmProvider>`.
- **Collapsible role permission groups** — every permission group inside Settings › Roles is now a collapsible box (collapsed by default). Group header shows granted/total count and a "N CHANGED" badge if any toggles in that group are dirty; Grant-all / Revoke-all still work while collapsed. State resets whenever a different role is selected so groups collapse fresh each time.

### Iteration 17 — Feb 2026
Massive feature push: Students tab + Roles/Permissions + Auth + Organizations.

- **Students tab** — new top-level nav with a roster of performers: photo, sizing measurements, size labels, notes, optional email invite. Header shows aggregate stats and a compact roster grid of every student × known size type. Fully-featured create/edit dialog with configurable measurement/size keys (defaults from `/api/students/config`). Optional email queues an invite record for later delivery.
- **Roles & Permissions (RBAC data model)** — new backend `/api/roles`, `/api/permissions/catalog`, `/api/roles/reset-defaults`. Ten built-in role presets (Director, Assistant Director, Tech Director, Costumes Manager, Student + Captain + Company Manager, Parent Volunteer + Costuming + Stage Management) with sensible defaults across 34 permission keys grouped into Costumes / Equipment / Shows / Storage & Maps / Flags / Students / Organisation. Director-only Settings › Roles tab renders the full matrix with Grant-all / Revoke-all bulk actions, custom role creation and clone-from-existing.
- **Authentication** — dual flow (Emergent-managed Google Auth + Email/Password), one unified `users` + `user_sessions` collection. Frontend gated behind `<AuthProvider>` + `<ProtectedRoute>`. Login page has "Continue with Google" and a classic email/password form (register + sign-in in one modal). AuthCallback synchronously handles the `#session_id=` fragment. HttpOnly `session_token` cookie (7-day expiry) with `secure`/`samesite=none`. Global middleware requires auth on every `/api/*` request except `/api/auth/*`, `/api/images/*`, `/api/invites/preview/*`, and the health root. First-ever registered user is auto-promoted to Director + super-admin.
- **Organizations & Invites** — new `organizations`, `invites` collections. First user's registration bootstraps a "Default Organization" and back-fills `org_id` on every existing document across owned collections (costumes, equipment, shows, locations, categories, sorting systems, students, flag_categories, roles, settings). Onboarding page (`/onboarding`) offers "Create new organization" or "Redeem invite code" — invite links prefill via `?invite=CODE`. Directors create invites (role + email + expiry) from Settings › Organization; users hitting the link land in onboarding with a preview of the org name + role. Members list, role changes and remove-from-org actions are all in the same Org tab. Roles endpoint is now org-scoped so cross-org role bleed is gone.

### Iteration 22 — Feb 2026 (this session)
CSV importers, shortage alerts, printable run sheets, YouTube scrubber.

- **Costume + Equipment CSV Import with Column-Mapping Wizard** — new `POST /api/costumes/import` and `POST /api/equipment/import` endpoints accept a batch of rows plus `dry_run`. Duplicates are detected by name; unknown categories and locations auto-create (opt-out flags exposed). Reusable `ImportWizard` component runs a 4-step flow (upload → map → preview → done), auto-maps common headers via aliases, and supports per-column size mapping (`Size · System · S/M/L/…`). Wired into both Inventory ("Import CSV" button, `data-testid="import-costumes-btn"`) and Equipment.
- **Assignment Alerts** — every costume payload now carries a computed `shortage` boolean (true when `in_use` and `in_use_quantity < len(assigned_student_ids)`). Inventory cards render a compact `SHORT · N` badge; Wardrobe shows a red banner listing every shortage with a qty ratio chip and highlights individual kanban tiles with a red border + inline `SHORT` badge.
- **Show Night Print Run Sheet** — Wardrobe now has a "Print Run Sheet" button that emits one Letter-portrait page per student via a hidden `.wardrobe-print-only` DOM tree activated by an `html.printing-run-sheet` class. Each page prints student name, category, sizes/measurements grid, and every assigned costume with 72×72 image, location, show, notes and a check box. Footer includes printed-at timestamp + dresser signature line.
- **Video Timestamp Scrubber** — new `VideoTimestampScrubber` component loads the YouTube IFrame API on demand, polls the current playhead, and offers "Capture time" (writes `mm:ss` back into the timestamp input) + "Jump to saved". Non-YouTube links show a clear fallback line. Integrated inside the CostumeFormDialog next to every show's timestamp input.

**Iteration 22 test summary** — 10/10 backend pytest green (imports dry-run + real, duplicate/invalid detection, auto-create categories + locations, shortage computed on list/detail/update). Frontend Playwright confirmed wizard step counter, shortage badges/banner, print-sheet DOM (one page per student), VTS DOM presence.

### Iteration 23 — Feb 2026 (this session)
Import history + undo, permission-aware UI, show manifest PDF.

- **Import History with Undo** — every non-dry-run costume/equipment import now writes an `import_batches` doc capturing the created IDs, actor, dupe + invalid counts. New endpoints `GET /api/imports` (newest 200 batches) and `POST /api/imports/{id}/undo` (deletes each id from the right collection, marks the batch `undone`, 409 on double-undo, 404 on unknown). Reusable `ImportHistoryDialog` shows a compact log with relative timestamps and per-row **Undo batch** buttons. Auto-created categories/locations are intentionally kept so undo is a data-only rollback.
- **Permission-Aware UI** — `Import CSV` + `Import history` on Inventory now gated on `costumes.create`; same buttons on Equipment gated on `equipment.create`; `Print Run Sheet` on Wardrobe gated on `students.view`; `Print manifest` on Show detail gated on `costumes.view`. Uses the existing `useAuth().hasPerm(key)` helper, which respects `is_superadmin` too.
- **Show Manifest PDF** — new **Print manifest** button on `/show/:id` fires a print job that emits a hidden `.show-manifest-only` DOM tree via an `html.printing-manifest` class + `@media print` rules. Manifest is a single table with 42×52 thumbnails, name (+ ORIGINAL flag for originals), category, location (+ sub-location), quantity and a check box per row. Header shows show name, year, total pieces, printed timestamp and show notes.
- **Data fix** — admin@luxe.test's stale `role_id` was re-linked to the current Director role in the Default Org (also `is_superadmin=true`). Fixes empty-permissions state that caused the perm-gated buttons to be hidden for the test director.

**Iteration 23 test summary** — 5/5 backend pytest green (imports batch write, dry-run does NOT record, undo deletes + flips flag, double-undo 409, unknown 404). Frontend Playwright confirmed: history dialog on Inventory + Equipment (filter working), wardrobe print visible for director, show manifest DOM has one row per attached costume, UI undo flow verified end-to-end.

**Known followup for Iteration 18** — extend org scoping across the remaining read/write endpoints (costumes, equipment, shows, etc.). Today, roles are org-scoped; other collections still read globally after the Default-Org backfill. Since existing customers all live inside the Default Org this is safe; new orgs will need explicit filtering when the app opens to true multi-tenancy.

## Backlog

### P0 — Round 3 (next iteration)
- Full multi-tenant scoping of costumes / equipment / shows / locations / flags / students / categories / sizing-systems queries (currently only writes carry `org_id`; reads are still global inside the Default Org).
- Email delivery for invites and student sign-up (currently stub-marked as "queued").
- Front-end permission enforcement — hide buttons and pages based on `user.role.permissions` (currently just data-driven).

### P1
- Image editing (crop / rotate) inside upload flow.
- Batch actions on inventory list.
- Print / share a show's costume manifest.
- Persistent filters (URL sync) on Inventory.

### P2
- Backend router split (`server.py` now ~3300 lines).
- Hex validation on category color.
- Debounce `/categories/similar` on server side.
- Aggregation-pipeline delete for flag category cascade.

## Test status
- **Iteration 17 backend**: 19/19 iteration_10 pytest tests pass after the cross-org role isolation fix (iteration_11 re-run). Auth flow (register → me → login → logout), students CRUD + config + stats + invite, roles matrix (10 presets, 34 keys, clone_from, delete blocked for system roles, reset-defaults), org & invites (create org promotes to Director, invites are 10-char alphanumeric, redeem attaches role + org_id), is_live show toggle attaches/releases costumes, `_detach_item_from_all_maps` runs on move/update/delete. **Fix landed**: POST /api/roles now stamps `org_id` from the authenticated session; `_create_new_org` clones only Default Org's `is_system=true` roles; Role Pydantic model exposes `org_id`. Custom roles no longer leak across orgs.
- **Iteration 17 frontend**: Login page, Onboarding page, Students tab, Roles matrix and Organization tab all screenshot-verified at 1440×900 through the /login → protected-route flow.
- **Known pre-existing failures** (unchanged, out of scope): 4 legacy backend_test.py tests still reference removed schema fields (`original_show_id`, `additional_show_ids`, `link_timestamp`, old group_full_flow).
- No known blocking issues.

## Test credentials
See `/app/memory/test_credentials.md`.
