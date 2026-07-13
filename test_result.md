#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Iteration 10: three connected feature changes to the LUXE Inventory app.
  1. Merge categories + costume groups: categories now act like groups (image, general location, notes, keywords) and subcategories are nested "group-like" items. Retain group functionality on Category and Subcategory.
  2. Costume creation changes:
     - Remove "original show"; costume just has a list of shows it appears in.
     - Each per-costume show entry has its own timestamp; the show video timestamp field has been removed from the show, and each costume can provide/edit the show's link inline.
     - Rename "sizing system" → "sorting system" (same concept, generalized). Allow creating new sorting systems inline from the costume form.
  3. Dashboard: 8 clickable tiles total. Included: Total Pieces, Total Quantity, Equipment (placeholder → /equipment page), In Use, Categories, Storage Locations, Shows, Flagged. All tiles route to their respective sections. Added Equipment tab in main navigation between Inventory and Shows.

backend:
  - task: "Costume model: replace original_show_id/additional_show_ids with per-costume shows list (with timestamps)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Added CostumeShowEntry model. CostumeBase now has `shows: List[CostumeShowEntry]` and no `original_show_id`/`additional_show_ids`. CostumeUpdate accepts `shows`. On create/update, origin_year is computed as MIN(show.year) across the costume's shows. On startup, existing costumes without a `shows` field are migrated from legacy `original_show_id` + `additional_show_ids`. GET /costumes filter by `show_id` matches both new `shows.show_id` and legacy fields.
        - working: true
          agent: "testing"
          comment: |
            TESTED: Created 2 shows (2020, 2024). POST costume with shows list containing both shows with timestamps. Verified: (1) shows list preserved with correct timestamps, (2) origin_year=2020 (MIN of years), (3) PUT to update shows list to only 2024 show → origin_year updated to 2024, (4) GET /costumes?show_id filter correctly includes costume, (5) Legacy field sizing_system correctly updates sorting_system. All assertions passed.

  - task: "Rename Costume.sizing_system → sorting_system; add /sorting-systems endpoints as aliases"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Costume now stores `sorting_system`. Payload accepts both `sorting_system` and legacy `sizing_system`. New `/api/sorting-systems` GET/POST/PUT/DELETE endpoints delegate to the existing sizing_systems collection. Startup migration copies existing `sizing_system` value → `sorting_system` for docs missing the new field. Delete guard checks both fields.
        - working: true
          agent: "testing"
          comment: |
            TESTED: (1) GET /sorting-systems returns 4 default systems (Letter, Number (Even), Tall, Petite), (2) POST new system "Colors" with sizes [Red, Green, Blue] → created successfully, (3) PUT to update sizes → updated to 4 sizes, (4) DELETE system → deleted successfully, (5) Cross-check: /sorting-systems and /sizing-systems return identical lists. All CRUD operations working correctly.

  - task: "Show model: remove link_timestamp; migration unsets it"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Show and ShowPayload no longer carry `link_timestamp`. On startup, `link_timestamp` is $unset from all show docs. Show create/update ignore the field. delete_show also blocks removal if any costume references the show via the new `shows.show_id` list.
        - working: true
          agent: "testing"
          comment: |
            TESTED: (1) POST show with link_timestamp field → field ignored, not present in response, (2) PUT show_link → updated successfully, link_timestamp still not in response, (3) DELETE show while costume references it via new shows list → correctly returns 409 conflict. All behaviors correct.

  - task: "Category enrichment: image_id, location, sub_location, notes, keywords, creator on Category and Subcategory"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            CategoryUpdate now accepts image_id, location, sub_location, notes, keywords, creator. SubcategoryPayload/SubcategoryRename accept image_id, location, sub_location, notes, keywords. GET /categories fills defaults for these fields. _normalize_subcategories preserves them.
        - working: true
          agent: "testing"
          comment: |
            TESTED: (1) POST category "Earrings", (2) PUT with enrichment fields (location=Vault, sub_location=Drawer 3, notes, keywords, creator=Alice) → all fields persisted correctly, (3) POST subcategory "Studs" with location=Vault, notes=Post backs → created with enrichment fields, (4) PUT subcategory with notes only (no name) → notes updated, name unchanged, (5) GET categories → all enrichment fields persisted. All operations working correctly.

  - task: "Stats endpoint: expose total_shows, total_locations, equipment_count"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            /api/stats returns total_shows (from shows collection), total_locations (from locations collection), equipment_count (from equipment collection — currently 0, placeholder for future).
        - working: true
          agent: "testing"
          comment: |
            TESTED: GET /api/stats returns all required fields: total_shows (0), total_locations (6 seeded), equipment_count (0). All fields are integers as expected. Working correctly.

frontend:
  - task: "Dashboard: 8 clickable tiles routing to their sections"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Dashboard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Dashboard grid now shows 8 tiles: Total Pieces, Total Quantity, Equipment, In Use, Categories, Storage Locations, Shows, Flagged. Each tile is a <button> that navigates to /inventory, /equipment, /settings, /locations, /shows, or /flags accordingly. Hover states show "VIEW →" indicator.

  - task: "Layout: Equipment nav tab; new /equipment stub page"
    implemented: true
    working: "NA"
    file: "frontend/src/components/Layout.jsx, frontend/src/pages/Equipment.jsx, frontend/src/App.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Added Equipment nav item using Wrench icon between Inventory and Shows. Mobile nav grid changed to 4 cols. New /equipment route renders a "Coming soon" placeholder card.

  - task: "CostumeFormDialog: remove Original Show; add per-costume shows list with per-entry timestamp and inline show link editing; rename Sizing → Sorting; inline create sorting system"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CostumeFormDialog.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Removed originalShowId + additionalShowIds state; introduced costumeShows: [{show_id, timestamp}] and showLinkEdits map. UI shows a list of attached shows each with a video link input (pre-filled from show.show_link, saved back to the show on submit) and a timestamp input. "Add a show" dropdown lets user pick or create new. Label changed to "SORTING SYSTEM". Added inline "+ New sorting system…" flow that POSTs to /sorting-systems and selects the new system.

  - task: "Shows.jsx: remove link_timestamp field from form; ShowDetail.jsx: watch link no longer includes timestamp; use per-costume shows list for attach/detach"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Shows.jsx, frontend/src/pages/ShowDetail.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Shows form no longer has a timestamp field. Show video "Watch this show" link no longer appends timestamp. countsByShow, originals, additionals, attachSelected, detachCostume rewritten to use new `shows` field (with legacy fallback).

  - task: "CostumeDetail.jsx: render new shows list with per-entry timestamp + watch link"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/CostumeDetail.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Detail page collects showEntries from costume.shows (falls back to legacy fields) and displays them each with an optional per-costume timestamp badge + a "Watch @ moment" link built by buildTimestampedUrl.

  - task: "Inventory.jsx: hide New Group button and Groups strip; use sorting_system with legacy fallback"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Inventory.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            The "New Group" button was removed and the Groups strip is now gated to never render (kept the code path for a possible rollback). CostumeCard/CostumeTable read costume.sorting_system with fallback to costume.sizing_system.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Costume model: replace original_show_id/additional_show_ids with per-costume shows list (with timestamps)"
    - "Rename Costume.sizing_system → sorting_system; add /sorting-systems endpoints as aliases"
    - "Show model: remove link_timestamp; migration unsets it"
    - "Category enrichment: image_id, location, sub_location, notes, keywords, creator on Category and Subcategory"
    - "Stats endpoint: expose total_shows, total_locations, equipment_count"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 10 backend + frontend changes are in. Please verify backend endpoints end-to-end:

        1. GET /api/stats returns the new fields total_shows, total_locations, equipment_count.
        2. GET /api/sorting-systems, POST /api/sorting-systems, PUT /api/sorting-systems/{id}, DELETE /api/sorting-systems/{id} — all should behave identically to /api/sizing-systems (they share the same underlying collection).
        3. POST /api/costumes accepts new `shows: [{show_id, timestamp}]` list; origin_year is set to MIN(show.year) among attached shows.
        4. PUT /api/costumes/{id} with `shows` updates the list and re-computes origin_year. Passing `sorting_system` overrides the field; passing legacy `sizing_system` should also work (aliased).
        5. GET /api/costumes?show_id=X should match costumes referencing X via new `shows` list AND via legacy original_show_id/additional_show_ids.
        6. POST /api/shows / PUT /api/shows/{id}: `link_timestamp` no longer required; endpoints ignore it if sent.
        7. DELETE /api/shows/{id}: refuse deletion if any costume references the show via new `shows` list.
        8. Category endpoints (POST /api/categories, PUT /api/categories/{id}, POST subcategories, PUT subcategories) accept and persist image_id, location, sub_location, notes, keywords, creator (rename-only calls to subcategories should also still work).

        No prior test credentials. No auth. Please treat any 4xx/5xx as failure. If a legacy costume already exists in the DB (there shouldn't be any yet — empty DB), the startup migration should populate `shows` from legacy fields.
    - agent: "testing"
      message: |
        ✅ ALL BACKEND TESTS PASSED (5/5)
        
        Completed comprehensive end-to-end testing of all Iteration 10 backend features:
        
        1. ✅ Stats endpoint: total_shows, total_locations, equipment_count all present and correct (0, 6, 0 in fresh DB)
        2. ✅ Sorting systems: Full CRUD working, cross-check with sizing-systems confirmed identical
        3. ✅ Costumes with shows list: Per-costume shows with timestamps working, origin_year computed as MIN(show.year), updates recalculate correctly, show_id filter working, legacy sizing_system field correctly updates sorting_system
        4. ✅ Shows: link_timestamp field removed and ignored on POST/PUT, show_link updates working, DELETE with costume reference correctly returns 409
        5. ✅ Categories enrichment: All new fields (image_id, location, sub_location, notes, keywords, creator) working on both Category and Subcategory, partial updates (notes-only) working correctly
        
        All backend APIs are functioning correctly. No errors or failures detected.

## Iteration 11 — Jul 2026 (bug fixes + features)

user_problem_statement_iter11: |
  - Costume form: creating an inline subcategory wipes other fields; new sub also not auto-selected. Fix.
  - Sorting system should be optional; when none, a single Total Quantity input.
  - Replace all window.confirm() with in-page AlertDialog.
  - "Currently in use" can also set a current show; max 2 active shows at a time; show gets a LIVE indicator.
  - Ability to edit an existing show.
  - Prominent "remove costume from show" button.
  - Tab the Settings page (General / Storage / Categories / Sorting / Shows / Maintenance).
  - Fix show_flag_banner setting; add 3-mode "hide currently in-use" visibility (full / hide markers / hide all with "Don't spoil the surprise!").
  - Pinned costumes on dashboard (up to 8; fallback to recent); toggle in costume form.
  - Company name/logo update live without refresh.
  - Categories on Inventory: collapsible accordion sections grouping costumes.

backend_tasks_iter11:
  - task: "Costume: add pinned, current_show_id, total_quantity_override; enforce max 2 active shows; make sorting_system optional (blank allowed)"
    implemented: true
    working: true
    file: "backend/server.py"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Model now has `pinned: bool`, `current_show_id: Optional[str]`. CostumeCreate accepts `total_quantity_override` for when there's no sorting system. create_costume computes total_quantity from sizes when a sorting_system is set, else uses the override. update_costume respects override + clears sizes when sorting_system is switched to blank. _enforce_current_show_cap(new_show_id, exclude_id, cap=2) raises 409 if activating a 3rd distinct show. Turning off `in_use` also clears `current_show_id`.
      - working: true
        agent: "testing"
        comment: |
          TESTED: All features working correctly. (1) Optional sorting_system: POST costume with sorting_system="" and total_quantity_override=12 → response has sorting_system="", total_quantity=12, sizes={}. UPDATE costume from sorting_system="Letter" to "" with total_quantity_override=25 → sizes and size_notes cleared to {}, total_quantity=25. UPDATE back to sorting_system="Letter" with sizes={"M":3} → total_quantity auto-computed to 3. (2) Pinned field: POST costume with pinned=true → response.pinned=true. (3) Max 2 active shows: Created 4 shows (A, B, C, D). POST Costume1 with in_use=true, current_show_id=A → success. POST Costume2 with show B → success (2 distinct). POST Costume3 with show C → 409 "You can only have 2 shows actively running at once". POST Costume4 with show A (same as Costume1) → success (still 2 distinct). PUT Costume1 with in_use=false → current_show_id cleared to None. PUT Costume4 with in_use=false → current_show_id cleared. POST Costume5 with show C → success (now B, C active). POST Costume6 with show D → 409 (would be 3rd). All 13 test cases passed.

  - task: "Settings: add hide_in_use_mode ('full'|'hide_marker'|'hide_all')"
    implemented: true
    working: true
    file: "backend/server.py"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          SettingsUpdate/GET/PUT accept hide_in_use_mode. Only the 3 valid strings are allowed; validation returns 400 otherwise. Default is "full".
      - working: true
        agent: "testing"
        comment: |
          TESTED: All validation and persistence working correctly. (1) PUT /api/settings with hide_in_use_mode="hide_all" → 200, GET reflects value. (2) PUT with hide_in_use_mode="bogus" → 400 with message "hide_in_use_mode must be 'full', 'hide_marker', or 'hide_all'". (3) PUT with org_name="MyGroup" (no hide_in_use_mode field) → 200, hide_in_use_mode preserved as "hide_all". (4) PUT with hide_in_use_mode="hide_marker" → 200, value updated. (5) PUT with hide_in_use_mode="full" → 200, value updated. All 6 test cases passed.

  - task: "New endpoint GET /api/pinned returning list of pinned costumes"
    implemented: true
    working: true
    file: "backend/server.py"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Returns costumes with pinned=true, sorted by updated_at desc, limit 50.
      - working: true
        agent: "testing"
        comment: |
          TESTED: Endpoint working correctly. (1) POST costume with pinned=true → response.pinned=true. (2) GET /api/pinned → returns the pinned costume in list. (3) PUT costume with pinned=false → response.pinned=false. (4) GET /api/pinned → no longer includes the costume. All 2 test cases passed.

frontend_tasks_iter11:
  - task: "Fix costume form state resets from prop refetches (subcategory/show/sorting inline creation no longer wipes other fields)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CostumeFormDialog.jsx"
    needs_retesting: false
  - task: "Sorting system optional in form (None → single Total Quantity input)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CostumeFormDialog.jsx"
    needs_retesting: false
  - task: "In-page ConfirmDialog + provider; replace window.confirm across pages"
    implemented: true
    working: "NA"
    file: "frontend/src/components/ConfirmDialog.jsx + multiple pages"
    needs_retesting: false
  - task: "Current show on in-use costumes; LIVE indicator on Shows list"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CostumeFormDialog.jsx, Shows.jsx, Dashboard.jsx"
    needs_retesting: false
  - task: "Edit-existing-show dialog + delete on ShowDetail"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/ShowDetail.jsx"
    needs_retesting: false
  - task: "Prominent remove-costume-from-show button"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/ShowDetail.jsx"
    needs_retesting: false
  - task: "Tab-based Settings page; 3-way hide_in_use_mode UI; show_flag_banner honored on Dashboard"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Settings.jsx, Dashboard.jsx"
    needs_retesting: false
  - task: "Pinned costumes replace 'recently used' on Dashboard when >0; pin toggle in costume form"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Dashboard.jsx, CostumeFormDialog.jsx"
    needs_retesting: false
  - task: "Live-updating org name + logo via SettingsContext (no refresh needed)"
    implemented: true
    working: "NA"
    file: "frontend/src/context/SettingsContext.jsx, Layout.jsx, Settings.jsx"
    needs_retesting: false
  - task: "Inventory: collapsible category accordion grouping costumes"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Inventory.jsx"
    needs_retesting: false

test_plan_iter11:
  current_focus:
    - "Costume: add pinned, current_show_id, total_quantity_override; enforce max 2 active shows; make sorting_system optional (blank allowed)"
    - "Settings: add hide_in_use_mode ('full'|'hide_marker'|'hide_all')"
    - "New endpoint GET /api/pinned returning list of pinned costumes"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication_iter11:
  - agent: "main"
    message: |
      Iteration 11 backend changes. Please verify:

      1) POST /api/costumes with `sorting_system` blank (or omitted) — should be accepted; sizes={} allowed. If `total_quantity_override` is provided, that value is stored as `total_quantity`. If no override, total_quantity=0. `sorting_system` in the response should be "" (empty string).

      2) POST /api/costumes with `pinned: true` — response has pinned=true. GET /api/pinned returns it. Update it to pinned=false via PUT /api/costumes/{id} → GET /api/pinned no longer includes it.

      3) POST /api/costumes with `in_use: true` and `current_show_id: <show_id>` — response has current_show_id set. Now try to create a second costume with in_use=true + a different current_show_id — should succeed (2 distinct shows). Try a third with yet another new show — should FAIL with 409 "You can only have 2 shows actively running at once". Setting the same show_id as one already active for a new costume must still work.

      4) PUT /api/costumes/{id} with in_use=false → response has current_show_id=null.

      5) PUT /api/settings with hide_in_use_mode="hide_all" — succeeds; GET reflects. hide_in_use_mode="bogus" → 400.

      6) PUT /api/settings with hide_in_use_mode omitted — other fields still update normally.

      7) PUT /api/costumes/{id} with sorting_system="" — clears sizes/size_notes on the costume. total_quantity should honor a provided total_quantity_override.

      Please DO NOT test frontend. No auth. Empty DB is fine — testing should create the shows/costumes needed within the test.
  - agent: "testing"
    message: |
      ✅ ALL ITERATION 11 BACKEND TESTS PASSED (21/21)
      
      Completed comprehensive end-to-end testing of all 3 backend tasks:
      
      1. ✅ Optional sorting system + total override (3 tests):
         - POST costume with sorting_system="" and total_quantity_override=12 → correct response
         - UPDATE costume from sorting_system to blank → sizes/size_notes cleared, total_quantity from override
         - UPDATE costume back to sorting_system → total_quantity auto-computed from sizes
      
      2. ✅ Pinned costumes + /api/pinned endpoint (4 tests):
         - POST costume with pinned=true → response.pinned=true
         - GET /api/pinned → returns pinned costume
         - UPDATE costume to pinned=false → response.pinned=false
         - GET /api/pinned → excludes unpinned costume
      
      3. ✅ Max 2 active shows enforcement (8 tests):
         - Created 4 test shows (A, B, C, D)
         - POST Costume1 with show A → success
         - POST Costume2 with show B → success (2 distinct)
         - POST Costume3 with show C → 409 "You can only have 2 shows actively running at once"
         - POST Costume4 with show A (duplicate) → success (still 2 distinct)
         - UPDATE Costume1 to in_use=false → current_show_id cleared to None
         - UPDATE Costume4 to in_use=false → current_show_id cleared
         - POST Costume5 with show C → success (now B, C active)
         - POST Costume6 with show D → 409 (would be 3rd distinct)
      
      4. ✅ hide_in_use_mode setting (6 tests):
         - PUT with hide_in_use_mode="hide_all" → 200, GET reflects value
         - PUT with hide_in_use_mode="bogus" → 400 with validation message
         - PUT with org_name only → 200, hide_in_use_mode preserved
         - PUT with hide_in_use_mode="hide_marker" → 200, value updated
         - PUT with hide_in_use_mode="full" → 200, value updated
      
      All backend APIs are functioning correctly. No errors or failures detected.
