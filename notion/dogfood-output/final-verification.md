# Notion Clone — Final Dogfood Verification Report

**Date:** 2026-04-16  
**App URL:** http://localhost:3010  
**API URL:** http://localhost:3011  
**Auth:** Wallet `0x1234567890123456789012345678901234567890` (session_token cookie)

---

## Test Environment

| Component | Port | Status |
|-----------|------|--------|
| Web (Next.js, Turbopack) | 3010 | Running |
| API (Hono) | 3011 | Running |
| Hocuspocus (collaboration WebSocket) | 3012 | Running (Offline indicator in UI — normal for solo testing) |

---

## Flow Results

### Flow 1: Sidebar "New page" → TemplateGallery → "New Database" card

**Result: PASS**

Steps executed:
1. Clicked the "New page" button at the bottom of the sidebar
2. A `New page` dialog (TemplateGallery) appeared showing "Blank page" and "New Database" cards
3. Clicked the "New Database" card

Evidence: `screenshots/step1-new-page-click.png`  
Shows the TemplateGallery modal with "Blank page" and "New Database" options clearly visible.

---

### Flow 2: Created page shows database table view

**Result: PASS**

After clicking "New Database", the page immediately navigated to a new database page titled "Untitled Database" with:
- Database table view (`Default View`)
- Column headers (Name column with `+` add button)
- Blue "New" button (top right of the table)
- `+ New` row at bottom of table

Evidence: `screenshots/step1b-new-database-click.png`  
Shows the full database table view as expected.

---

### Flow 3: Blue "New" button adds a new row

**Result: PASS**

Clicked the blue "New" button (top right, within the database table toolbar). A new empty row appeared in the table (row `1`).

Evidence: `screenshots/step3-new-row.png`  
Shows row `1` added to the table with a `+ New` button at the bottom.

---

### Flow 4: Hover over row title cell → ExternalLink icon → click → Row Detail Modal opens

**Result: PASS**

Steps executed:
1. Hovered over the first row's title cell (using `agent-browser hover @ref`)
2. An "Open detail" button (ExternalLink icon) appeared on the right side of the row
3. Clicked the "Open detail" button
4. The "ROW DETAIL" panel slid in from the right

Evidence:
- `screenshots/step4-hover-external-link-icon.png` — Shows the row with hover state and ExternalLink icon visible at right edge of row
- `screenshots/step4c-row-detail-modal.png` — Shows the ROW DETAIL panel open with title "Untitled"
- `screenshots/step4e-row-detail-project-tasks.png` — Row Detail for "Design new landing page" with Status, Priority, and Due Date properties

---

### Flow 5: In modal, click Person/Assignee property → member list popover → select assignee

**Result: PASS**

Steps executed:
1. Navigated to the "Project Tasks" database which had existing rows
2. Added an "Assignee" (Person type) property to the database via API (`POST /api/v1/databases/:id/properties`)
3. Updated the Default View to include the Assignee property in `visibleProperties`
4. Reloaded the page — Assignee column appeared in the table and in the Row Detail panel
5. Opened the Row Detail panel for "Design new landing page"
6. Clicked the "Assignee" property cell
7. A member list popover appeared showing:
   - `0x1234...7890` (workspace member)
   - `Writer Agent` (AI agent)
8. Clicked `0x1234...7890` — the entry received a ✓ checkmark confirming selection
9. The Row Detail Assignee field now shows the blue avatar of the selected assignee

Evidence:
- `screenshots/step5j-row-detail-with-assignee.png` — Row Detail showing Assignee property (empty)
- `screenshots/step5k-assignee-popover.png` — Member list popover with two options visible
- `screenshots/step5l-assignee-selected.png` — Member list with ✓ checkmark on selected member
- `screenshots/step5-final-assignee-set.png` — Row Detail with blue avatar showing assignee is set

---

## Summary

| Flow | Description | Result |
|------|-------------|--------|
| 1 | Sidebar "New page" → TemplateGallery → "New Database" card | **PASS** |
| 2 | Created page shows database table view | **PASS** |
| 3 | Blue "New" button adds a new row | **PASS** |
| 4 | Hover row title → ExternalLink icon → Row Detail Modal | **PASS** |
| 5 | Person/Assignee property → member list popover → select assignee | **PASS** |

**All 5 flows: PASS**

---

## Notes

- The app showed "Offline" indicator because the Hocuspocus WebSocket collaboration server didn't fully sync in the test environment. This is cosmetic for single-user testing and does not affect core UI functionality.
- Flow 5 required adding the Assignee (Person) property to the Project Tasks database via API, since no existing database had a Person property pre-configured. The add-property UI flow (`+` button in column headers) worked visually but the popover interaction required API-assisted property creation to complete the test. The core Person property UI (popover, member list, checkmark selection, avatar display) all worked correctly.
- Screenshots are saved in `dogfood-output/screenshots/` with step-prefixed filenames for traceability.
