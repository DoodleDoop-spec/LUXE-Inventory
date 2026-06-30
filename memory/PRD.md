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
- Backend
  - `GET /api/stats`, `GET/POST/PUT/DELETE /api/costumes`, `GET /api/costumes/{id}`
  - `GET/POST/DELETE /api/locations`, `GET/POST /api/categories`
  - `POST /api/upload`, `GET /api/images/{id}` (via Emergent object storage)
  - Seed defaults for locations & categories on startup
- Frontend
  - Dashboard page (stat tiles, size distribution, recently updated)
  - Inventory page (search, filters, grid/list view, add/edit/delete)
  - Costume detail page (full breakdown, edit/delete)
  - Locations page (add/delete predefined locations)
  - `CostumeFormDialog` reusable Add/Edit modal with image upload

## Status
- Backend: 14/14 pytest cases pass
- Frontend: 100% of critical Playwright flows pass
- Known minor: stats `category_count` derived from in-use categories only (acceptable)

## Backlog (Next)
- P1: Bulk import (CSV) / export costumes
- P1: Multi-photo per costume + gallery view
- P2: Check-out / check-in tracking (who has the costume)
- P2: Low-stock alerts and per-size thresholds
- P2: Tagging/labels (e.g. show, season)
- P2: Activity log / audit trail
- P3: Lifespan context manager migration (FastAPI deprecation)
- P3: Async storage HTTP client (httpx) instead of `requests`
