# LUXE Inventory Management — PRD

## Original problem statement
A proprietary internal tracking system for costumes/accessories with location tracking, total quantity, size-specific quantity, and easy search/inventory management for non-technical team members.

## User personas
- **Wardrobe manager** — primary user; adds, edits, flags costumes; manages storage locations, shows and flag types.
- **Assistant / helper** — searches inventory, moves items via drag & drop, checks what is flagged.

## Core requirements (stable)
- Track costumes / accessories with sizes, quantity per size, hierarchical storage locations, hierarchical categories, and shows they appear in.
- Non-coding management of taxonomy (categories, subcategories, sizing systems, storage tree, shows, flag types).
- Robust search and sort (keywords, name, category, location, origin year).

## Implemented (running log)

### Iteration 1–7 (baseline app, prior sessions)
- FastAPI + MongoDB backend, React + Tailwind + shadcn/ui frontend.
- CRUD: Costumes, Categories (with nested subcategories), Locations (hierarchical tree), Shows (grouped by year), Groups (variants), Sizing systems, Settings.
- Rich costume form with sizes + per-size notes, keywords, creator, original show, additional shows, group + variant label.
- Inventory grid/list with filters, sort by origin year, group cards, image uploads.
- Legacy single-flag system (is_flagged + flag_reason).
- Origin year auto-derived from original show year.

### Iteration 8 — Feb 2026 (this session)
- **Dynamic branding**: `settings.org_name` + `settings.logo_image_id`. Navbar shows uploaded logo or two-letter initials fallback; Dashboard title uses org name; footer uses it too.
- **Flag system**:
  - `/api/flag-categories` CRUD (seeded: On Loan, Needs Repair, In Cleaning).
  - Costume `flags: [{id, category_id, note, created_at}]` array; legacy `is_flagged`/`flag_reason` kept in sync automatically.
  - New Flags tab (`/flags`) — manage flag types, view all costumes per flag.
  - `/api/costumes/{id}/flags` attach / update / detach single flag.
- **Add Show from Shows page** — Shows tab has `+ Add Show` dialog (name, year, watch link, cover photo, notes).
- **Quick-attach costumes to a Show** — ShowDetail has picker to multi-select from existing inventory; adds show to their `additional_show_ids`.
- **Color-coded categories** — per-category color (preset swatches + custom color picker) surfaced next to category name in cards, list rows and detail view.
- **Wording sweep**: "costumes / accessories" phrasing in placeholders, sub-copy and picker labels. Dashboard tile relabeled "Total Items"; Add button reads "Add Item".
- **buy_link on Costume** — link-to-buy field in form; shown as pill on CostumeDetail.
- **show_link on Show** — link-to-watch field in Shows form + Settings edit; shown as "Watch this show" button on ShowDetail.
- **Drag & drop on Inventory** — costume cards are draggable; on dragstart a bottom `dnd-dock` reveals category + location chips; drop reassigns via PUT `/api/costumes/{id}` (category+subcategory or location+sub_location).

## Backlog

### P0 (next up)
- **Inline entity creation from Costume form** — create new category/subcategory/storage location/show without leaving the form.
- **Search UI condense** — collapse global search into a magnifying-glass icon that expands on click.
- **Image uploads in notes and flag notes**.

### P1
- **Video timestamp** — accept optional timestamp for show_link and rewrite YouTube/Vimeo URL.
- **"Currently in use" state** — a per-costume state distinct from flags; prominently surfaced on Dashboard.
- **Category-duplicate suggestion** — non-aggressive toast when creating a category with a similar name.
- **Merge categories** — settings action to merge cat A into cat B (retaining chosen name).
- **Mobile-first pass** — layout polish for handhelds.
- **Data migration** — convert existing legacy flagged costumes into a default "Legacy" flag category so they show up in the Flags tab.

### P2 / Nice-to-have
- Backend router split (server.py is ~1400 lines).
- Hex validation for category color update.
- Aggregation-pipeline delete for flag category cascade.

## Test status
- Iteration 8 backend: 27/27 pytest tests passing (7 new for this iter).
- Iteration 8 frontend: all key testids verified live via Playwright.
- Known non-blocking: legacy is_flagged rows do not appear in flag category buckets.

## Test credentials
None required (no auth).
