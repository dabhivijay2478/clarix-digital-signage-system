# SignalOS — Product Requirements Document (PRD)
### Version 2.0 — Includes Truck Management Module
**Last Updated:** June 2026
**Author:** Product Owner
**Platform:** Tauri v2 + Next.js 16 + Rust — Desktop (macOS, Linux, Windows)

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Users & Personas](#3-users--personas)
4. [System Architecture Summary](#4-system-architecture-summary)
5. [Module 1 — Digital Signage (SignalOS Core)](#5-module-1--digital-signage-signalos-core)
6. [Module 2 — Truck Management System](#6-module-2--truck-management-system)
7. [Shared Infrastructure](#7-shared-infrastructure)
8. [Navigation & Information Architecture](#8-navigation--information-architecture)
9. [Data Models](#9-data-models)
10. [Status & Workflow Definitions](#10-status--workflow-definitions)
11. [UI/UX Requirements](#11-uiux-requirements)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Out of Scope](#13-out-of-scope)
14. [Milestones & Delivery Phases](#14-milestones--delivery-phases)
15. [Open Questions](#15-open-questions)

---

## 1. PROJECT OVERVIEW

### 1.1 What is SignalOS?

SignalOS is a self-hosted, offline-capable desktop application for managing digital signage networks and delivery fleet operations — all from a single interface. It runs as a native desktop app on macOS, Linux, and Windows using Tauri v2 (Rust backend) with a Next.js 16 frontend and shadcn/ui components.

The application has two primary modules:

| Module | Purpose |
|---|---|
| **Digital Signage** | Control screens, playlists, schedules, and content across a LAN network |
| **Truck Management** | Track delivery trucks from start → loading → in transit → delivered |

Both modules share the same app shell, navigation, database, and design system. There is no cloud dependency — all data is stored locally in SQLite via the Rust backend.

### 1.2 Why one app?

The operator managing digital signage (e.g. in a warehouse, depot, or retail location) is the same person coordinating deliveries. Having one desktop tool eliminates context switching, keeps data on-premise, and reduces software licensing costs.

### 1.3 The Problem Being Solved

**Signage problem:** Managing multiple screens across a LAN requires manual SSH or proprietary cloud tools. SignalOS gives a single local control panel for all screens.

**Truck problem:** Tracking deliveries with spreadsheets or WhatsApp is error-prone. There is no live status board showing which trucks are loading, on the road, or delivered. SignalOS's Truck module creates a real-time operations board without any external software.

---

## 2. GOALS & SUCCESS METRICS

### 2.1 Product Goals

- **G1:** Admin can manage all screens, content, and schedules from one desktop app with zero internet required.
- **G2:** Admin can create and track truck trips through their full lifecycle (Start → Loading → In Transit → Delivered) with a clear status board.
- **G3:** The app starts in under 3 seconds and feels native on all three OS platforms.
- **G4:** All data survives app restarts — nothing is lost in memory.

### 2.2 Success Metrics

| Metric | Target |
|---|---|
| App cold start time | < 3 seconds |
| Time to create a new trip | < 60 seconds |
| Time to update a trip status | < 10 seconds |
| Trip status board loads | < 1 second |
| Zero data loss on crash | SQLite WAL mode enforced |
| Signage sync to screen | < 5 seconds over LAN |

---

## 3. USERS & PERSONAS

### 3.1 Primary User — The Admin Operator

There is one user type for this application. The Admin Operator is a single person who:

- Works at a depot, warehouse, or operations center
- Manages 1–50 digital signage screens over a local area network
- Coordinates 1–30 delivery trucks per day
- Works at a desktop computer (Mac, Linux PC, or Windows PC)
- Does not need multi-user login — the app is single-user by design
- Needs to see the status of everything at a glance without navigating deep menus

**Key operator workflows:**

1. Morning: Check which trucks are assigned for the day, create new trips
2. Mid-day: Update trip statuses as drivers radio/call in updates
3. Afternoon: Mark deliveries as complete, review the day's completed trips
4. Ongoing: Push new content to signage screens, update schedules

---

## 4. SYSTEM ARCHITECTURE SUMMARY

### 4.1 Technology Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend framework | Next.js 16, React 19, TypeScript |
| UI components | shadcn/ui + Tailwind CSS v4 |
| Local database | SQLite (via rusqlite in Rust) |
| State management | Zustand (client-side stores) |
| IPC | Tauri commands (invoke) |
| LAN communication | Rust TCP/HTTP server on port 7420 |
| Build output | Static export → served by Tauri |

### 4.2 Data Flow

```
Admin UI (Next.js)
      │
      │  invoke('command_name', { args })
      ▼
Tauri Rust Backend
      │
      ├── SQLite (local file, all persistent data)
      │
      └── TCP Server (LAN) ──► Signage Screens
```

All Truck Management data lives in SQLite. No network communication needed for truck tracking — it is admin-only, desktop-only.

---

## 5. MODULE 1 — DIGITAL SIGNAGE (SIGNALOS CORE)

This module is already built. The PRD below documents the current feature set as the baseline.

### 5.1 Feature List — Signage Core

#### 5.1.1 Screen Management
- Register screens by name, location, IP address, resolution, and orientation
- View all screens in a card grid with live online/offline status
- Control power state and brightness per screen
- Sync playlists to screens over LAN
- Set operating hours per screen (schedule when screen is active)

#### 5.1.2 Content Library
- Upload and store content items: Images, Videos, Web Apps, Ads, Slideshows
- Assign tags, duration, and names to content items
- Search and filter the content library
- Delete content items

#### 5.1.3 Playlist Management
- Create named playlists with a default transition type
- Add, remove, and reorder content items within a playlist
- Set per-item duration override
- Configure per-item scheduling (time restrictions, day restrictions, date ranges)
- Assign transition effects per item

#### 5.1.4 Schedule System
- Create schedule slots: name, start time, duration, priority, target screens, days of week
- Weekly timeline view showing all slots across all days
- Conflict resolution by priority number

#### 5.1.5 Analytics
- Record signage events: Impression, Play, Complete
- View KPI cards: total impressions, plays, completions, completion rate
- Event timeline bar chart (by day, by event type)
- Time range filter: 7 days, 14 days, 30 days

#### 5.1.6 Player Mode
- Launch a fullscreen player on this machine (acts as a signage screen itself)
- Plays the assigned playlist for the current schedule slot
- Supports image, video, webapp, and slideshow content types
- Renders transitions between items
- Records analytics events locally

#### 5.1.7 Settings
- Customize app name, icon, and favicon (branding)
- Toggle sidebar collapse on startup
- Set LAN discovery port
- View device info (OS, version, hostname)

---

## 6. MODULE 2 — TRUCK MANAGEMENT SYSTEM

This module is **new** and is the primary addition in v2.0.

### 6.1 Overview

The Truck Management module gives the admin a complete operations board for tracking delivery trucks. Each truck makes trips. Each trip moves through a defined lifecycle:

```
CREATED → LOADING → IN TRANSIT → DELIVERED
```

The admin creates and manages everything. There are no driver logins. Status updates are made by the admin when informed by drivers (via radio, phone, or in person).

### 6.2 Core Concepts

| Concept | Definition |
|---|---|
| **Truck** | A physical vehicle with a registration number, make/model, and capacity. |
| **Driver** | A named person assigned to a truck for a trip. |
| **Route** | A named origin → destination path. Can be reused across multiple trips. |
| **Trip** | A single delivery run: one truck, one driver, one route, with a status. |
| **Status** | The current lifecycle stage of a trip (Created / Loading / In Transit / Delivered). |

### 6.3 Features — Truck Management

#### 6.3.1 Fleet Registry (Trucks)

The admin maintains a registry of all trucks in the fleet.

**Each truck record contains:**
- Truck ID (auto-generated)
- Registration number / plate (required, unique)
- Make and model (e.g. "Tata Ace", "Ashok Leyland 1616")
- Capacity (e.g. "5 tons", "20 ft")
- Status: Active or Inactive
- Notes (free text)

**Actions:**
- Add a new truck
- Edit truck details
- Mark a truck as Inactive (soft delete — past trips are preserved)
- View a truck's trip history

**Rules:**
- A truck cannot be assigned to two active trips simultaneously
- Inactive trucks do not appear in the trip creation form's truck selector

#### 6.3.2 Driver Registry

The admin maintains a list of drivers.

**Each driver record contains:**
- Driver ID (auto-generated)
- Full name (required)
- Phone number
- License number
- Status: Active or Inactive
- Notes

**Actions:**
- Add a new driver
- Edit driver details
- Mark a driver as Inactive
- View a driver's trip history

**Rules:**
- A driver cannot be assigned to two active (non-delivered) trips simultaneously
- Inactive drivers do not appear in the trip creation form

#### 6.3.3 Route Registry

The admin maintains a set of named, reusable routes.

**Each route record contains:**
- Route ID (auto-generated)
- Route name (required, e.g. "Hyderabad → Vijayawada")
- Origin (required)
- Destination (required)
- Estimated distance (km, optional)
- Estimated duration (hours, optional)
- Notes

**Actions:**
- Add a new route
- Edit route details
- Delete a route (only if no active trips use it)
- View which trips used this route

#### 6.3.4 Trip Management (Core Feature)

Trips are the central object of the module. Every delivery is a trip.

**Each trip record contains:**
- Trip ID (auto-generated)
- Trip name / reference number (required, e.g. "TRP-2026-001")
- Assigned truck (required — select from active fleet)
- Assigned driver (required — select from active drivers)
- Assigned route (required — select from routes)
- Status (Created / Loading / In Transit / Delivered)
- Scheduled departure date and time
- Cargo description (free text, optional)
- Notes (free text, optional)
- Timestamps: created_at, loading_started_at, departed_at, delivered_at

**Actions:**
- Create a new trip
- Edit trip details (only when status = Created)
- Advance trip status (see workflow below)
- Cancel a trip (sets status = Cancelled, frees truck and driver)
- View trip details
- Delete a trip (only when status = Created or Cancelled)

#### 6.3.5 Trip Status Workflow

Status transitions are one-directional. The admin clicks an action button to move a trip forward.

```
┌─────────┐     ┌─────────┐     ┌────────────┐     ┌───────────┐
│ CREATED │────►│ LOADING │────►│ IN TRANSIT │────►│ DELIVERED │
└─────────┘     └─────────┘     └────────────┘     └───────────┘
     │                │                │
     └────────────────┴────────────────┴──► CANCELLED (from any active state)
```

**Status definitions:**

| Status | Meaning | Button Label | Timestamp Recorded |
|---|---|---|---|
| CREATED | Trip is planned, not yet started | "Start Loading" | created_at |
| LOADING | Truck is being loaded at depot | "Dispatch (Mark In Transit)" | loading_started_at |
| IN TRANSIT | Truck is on the road | "Mark Delivered" | departed_at |
| DELIVERED | Delivery is complete | — (terminal state) | delivered_at |
| CANCELLED | Trip was cancelled | — (terminal state) | cancelled_at |

**Rules:**
- You cannot skip statuses (e.g. cannot go from CREATED to DELIVERED directly)
- DELIVERED and CANCELLED are terminal — no further changes allowed
- Cancelling a trip immediately frees the truck and driver for new trips
- When a trip is marked DELIVERED, the truck and driver are freed automatically

#### 6.3.6 Operations Dashboard (Truck Board)

The primary view of the Truck module is a live status board — a Kanban-style board with one column per status.

**Board columns:**
1. **Created** — Planned trips not yet started
2. **Loading** — Trucks currently being loaded
3. **In Transit** — Trucks on the road
4. **Delivered (Today)** — Completed today (resets at midnight or on manual archive)

**Each trip card on the board shows:**
- Trip reference number
- Truck registration + make/model
- Driver name
- Route name (origin → destination)
- Scheduled departure time
- Time elapsed in current status (e.g. "Loading for 45 min")
- Action button to advance status
- Cancel button (for active trips)

**Board behavior:**
- Cards move columns in real time when status is updated
- Board auto-refreshes — no manual reload needed
- Delivered column shows only today's deliveries by default
- Summary counts at the top: X Created, X Loading, X In Transit, X Delivered Today

#### 6.3.7 Trip History & Log

A searchable, filterable list of all trips — past and present.

**Filters:**
- Date range (from / to)
- Status (All / Created / Loading / In Transit / Delivered / Cancelled)
- Truck (select from fleet)
- Driver (select from drivers)
- Route (select from routes)

**Table columns:**
- Trip reference
- Truck
- Driver
- Route
- Status (badge)
- Scheduled departure
- Delivered at (or — if not delivered)
- Total duration (delivered_at − created_at, or — if ongoing)
- Actions: View details

**Export:**
- Export filtered results as CSV (using Rust file dialog)

### 6.4 Truck Module — Page Structure

| Page / View | Path | Description |
|---|---|---|
| Operations Board | /trucks | Kanban board — default view |
| Trip History | /trucks/history | Searchable log of all trips |
| Fleet Registry | /trucks/fleet | List and manage trucks |
| Driver Registry | /trucks/drivers | List and manage drivers |
| Route Registry | /trucks/routes | List and manage routes |
| Trip Detail | /trucks/trips/[id] | Single trip detail view |

---

## 7. SHARED INFRASTRUCTURE

### 7.1 Navigation

The sidebar gains a new "Trucks" section below the existing signage navigation.

**Sidebar structure (updated):**

```
─── SIGNAGE ───────────────────
  Dashboard
  Screens
  Content
  Playlists
  Schedule
  Analytics

─── FLEET ─────────────────────
  Operations Board       ← new
  Trip History           ← new
  Fleet (Trucks)         ← new
  Drivers                ← new
  Routes                 ← new

─── SYSTEM ────────────────────
  Settings
```

### 7.2 Notifications (Toast)

Truck module uses the same Sonner toast system as the signage module.

| Event | Toast type |
|---|---|
| Trip created | Success |
| Status advanced | Success |
| Trip cancelled | Warning |
| Validation error (e.g. truck busy) | Error |
| Export complete | Info |

### 7.3 Empty States

Every list view must have a meaningful empty state with:
- An icon relevant to the entity (truck, driver, route)
- A short title ("No trucks yet")
- A description ("Add your first truck to start creating trips")
- A primary CTA button

---

## 8. NAVIGATION & INFORMATION ARCHITECTURE

### 8.1 Full App Map

```
SignalOS Desktop App
│
├── /                    Dashboard (Signage overview)
├── /screens             Screen management + playlist editor
├── /content             Content library
├── /playlists           Playlist builder
├── /schedule            Schedule + weekly timeline
├── /analytics           Analytics board
├── /player              Fullscreen signage player
│
├── /trucks              ← NEW: Operations board (Kanban)
├── /trucks/history      ← NEW: Trip history log
├── /trucks/fleet        ← NEW: Truck registry
├── /trucks/drivers      ← NEW: Driver registry
├── /trucks/routes       ← NEW: Route registry
└── /trucks/trips/[id]   ← NEW: Trip detail view
│
└── /settings            App settings
```

---

## 9. DATA MODELS

### 9.1 Truck

```
trucks
  id                TEXT  PRIMARY KEY  (uuid)
  registration      TEXT  NOT NULL UNIQUE
  make_model        TEXT  NOT NULL
  capacity          TEXT
  status            TEXT  NOT NULL  DEFAULT 'active'  -- 'active' | 'inactive'
  notes             TEXT
  created_at        TEXT  NOT NULL
  updated_at        TEXT  NOT NULL
```

### 9.2 Driver

```
drivers
  id                TEXT  PRIMARY KEY  (uuid)
  full_name         TEXT  NOT NULL
  phone             TEXT
  license_number    TEXT
  status            TEXT  NOT NULL  DEFAULT 'active'  -- 'active' | 'inactive'
  notes             TEXT
  created_at        TEXT  NOT NULL
  updated_at        TEXT  NOT NULL
```

### 9.3 Route

```
routes
  id                TEXT  PRIMARY KEY  (uuid)
  name              TEXT  NOT NULL
  origin            TEXT  NOT NULL
  destination       TEXT  NOT NULL
  distance_km       REAL
  estimated_hours   REAL
  notes             TEXT
  created_at        TEXT  NOT NULL
  updated_at        TEXT  NOT NULL
```

### 9.4 Trip

```
trips
  id                    TEXT  PRIMARY KEY  (uuid)
  reference             TEXT  NOT NULL UNIQUE   -- e.g. "TRP-2026-001"
  truck_id              TEXT  NOT NULL  REFERENCES trucks(id)
  driver_id             TEXT  NOT NULL  REFERENCES drivers(id)
  route_id              TEXT  NOT NULL  REFERENCES routes(id)
  status                TEXT  NOT NULL  DEFAULT 'created'
                              -- 'created' | 'loading' | 'in_transit'
                              -- | 'delivered' | 'cancelled'
  scheduled_departure   TEXT  NOT NULL
  cargo_description     TEXT
  notes                 TEXT
  created_at            TEXT  NOT NULL
  loading_started_at    TEXT
  departed_at           TEXT
  delivered_at          TEXT
  cancelled_at          TEXT
  updated_at            TEXT  NOT NULL
```

### 9.5 Existing Signage Tables (unchanged)

The following tables remain from SignalOS v1 and are not modified:

- `screens` — registered signage screens
- `content_items` — uploaded content
- `playlists` — named playlists
- `playlist_items` — items within playlists
- `schedule_slots` — time-based schedule entries
- `analytics_events` — signage playback events

---

## 10. STATUS & WORKFLOW DEFINITIONS

### 10.1 Trip Lifecycle — Full Detail

#### CREATED
- **Entry:** Admin clicks "+ New Trip" and submits the form
- **What it means:** Trip is planned. Truck and driver are considered reserved.
- **Allowed actions:** Edit details, Start Loading, Cancel
- **Exit condition:** Admin clicks "Start Loading"

#### LOADING
- **Entry:** Admin clicks "Start Loading" → `loading_started_at` is recorded
- **What it means:** The truck is physically at the depot being loaded with cargo
- **Allowed actions:** Dispatch (mark in transit), Cancel
- **Exit condition:** Admin clicks "Dispatch"

#### IN TRANSIT
- **Entry:** Admin clicks "Dispatch" → `departed_at` is recorded
- **What it means:** Truck is on the road toward the destination
- **Allowed actions:** Mark Delivered, Cancel
- **Exit condition:** Admin clicks "Mark Delivered"

#### DELIVERED
- **Entry:** Admin clicks "Mark Delivered" → `delivered_at` is recorded
- **What it means:** Cargo successfully delivered. Trip is complete.
- **Allowed actions:** View only (terminal state)
- **Truck and driver:** Freed immediately for new trips

#### CANCELLED
- **Entry:** Admin clicks "Cancel Trip" from any non-terminal state → `cancelled_at` recorded
- **What it means:** Trip was aborted. No delivery made.
- **Allowed actions:** View only (terminal state)
- **Truck and driver:** Freed immediately

### 10.2 Truck Availability Rule

A truck is considered **busy** if it has a trip in status: CREATED, LOADING, or IN TRANSIT.
A truck is considered **free** if its most recent trip is DELIVERED or CANCELLED, or it has no trips.

The trip creation form must enforce this: a busy truck must not appear as selectable (or must show a warning and be disabled).

Same rule applies to drivers.

---

## 11. UI/UX REQUIREMENTS

### 11.1 Design System

The Truck module uses the same design system as the rest of SignalOS:

- **Component library:** shadcn/ui (already installed)
- **Theme:** Midnight (dark, zinc-950 background, indigo-500 primary)
- **Typography:** Inter (body), system-ui fallback
- **Icons:** lucide-react (already in use)
- **Toast:** Sonner (already configured)
- **Modals:** shadcn Dialog (already configured)

### 11.2 Operations Board (Kanban) — UX Detail

- Board is the default/home page of the Trucks module (`/trucks`)
- 4 columns displayed horizontally, each scrollable vertically
- Column headers show status name + count badge
- Cards are draggable within the board for future versions (v3) — for now, status is changed via button only
- "In Transit" column cards show a subtle pulsing animation on the status dot to indicate active movement
- Delivered column is dimmed slightly (opacity-70) to de-emphasize completed work
- A "View All Delivered" link at the bottom of the Delivered column opens /trucks/history pre-filtered to today's delivered trips

### 11.3 Trip Creation Form — UX Detail

- Opened as a shadcn Dialog (not a new page)
- Reference number is auto-generated (TRP-YYYY-NNN) but editable
- Truck selector shows registration + make/model + "(Busy)" label if unavailable
- Driver selector shows name + "(On Trip)" label if unavailable
- Busy trucks and drivers appear in the list but are disabled (not hidden) — admin needs to see why
- Scheduled departure defaults to current date/time + 30 minutes
- Form validates all required fields before allowing submit
- On success: Dialog closes, card appears in "Created" column, success toast fires

### 11.4 Status Advancement — UX Detail

- Status buttons on the Kanban card are compact (small variant)
- Clicking a status advancement button opens a confirmation popover (not a full Dialog) with the action name and a confirm/cancel choice
- After confirmation, the card animates out of the current column and into the next column
- The timestamp is recorded at the moment the admin confirms — not when they click the button

### 11.5 Responsive Behavior

The app is desktop-only (Tauri). Minimum supported window width is 1024px. The Kanban board requires at least 1100px to display all 4 columns without horizontal scrolling. Below 1100px, the board scrolls horizontally inside a ScrollArea.

---

## 12. NON-FUNCTIONAL REQUIREMENTS

### 12.1 Performance

| Requirement | Target |
|---|---|
| Operations board initial load | < 800ms |
| Status update (UI reflects change) | < 300ms |
| Trip history query (up to 1000 rows) | < 500ms |
| CSV export (up to 1000 rows) | < 2 seconds |

### 12.2 Data Integrity

- All SQLite writes use transactions — partial writes are rolled back automatically
- SQLite WAL mode is enabled for crash safety
- Trip status can only move forward (enforced in Rust backend, not just frontend)
- Truck/driver busy check is enforced in the Rust command handler, not just the UI

### 12.3 Offline Operation

- The Truck module is 100% offline — no network required, ever
- All data is in local SQLite
- The signage LAN server does not interact with truck data

### 12.4 Platform Support

| Platform | Minimum Version |
|---|---|
| macOS | 12 Monterey |
| Windows | 10 (64-bit) |
| Linux | Ubuntu 20.04 / Debian 11 |

### 12.5 Data Backup

- The SQLite database file location is shown in Settings
- Admin can manually copy the file to back it up
- Future: one-click backup to local folder (v3 scope)

---

## 13. OUT OF SCOPE

The following are explicitly **not** in scope for this version (v2.0):

| Feature | Reason / Future Version |
|---|---|
| Driver mobile app or web portal | Drivers do not use the system — admin-only |
| Real-time GPS tracking | No GPS integration in v2 |
| Customer delivery tracking | No customer-facing interface |
| Multi-user / login system | Single admin user |
| Cloud sync or backup | Offline-first — no cloud |
| Fuel logs or maintenance records | Fleet maintenance is v3 scope |
| Invoice or billing generation | Separate accounting tool |
| Photo or signature capture | v3 scope |
| Push notifications | No mobile, no cloud |
| Route optimization / maps | v3 scope |
| Cargo weight / manifest detail | v3 scope |
| Drag-to-reorder on Kanban board | v3 scope |

---

## 14. MILESTONES & DELIVERY PHASES

### Phase 1 — Foundation (Week 1–2)
- [ ] Add Trucks sidebar section and routing structure
- [ ] Create SQLite tables: trucks, drivers, routes, trips
- [ ] Write Rust Tauri commands for all CRUD operations
- [ ] Write TypeScript types for all new entities

### Phase 2 — Registries (Week 2–3)
- [ ] Fleet registry page (trucks list + add/edit/deactivate)
- [ ] Driver registry page (drivers list + add/edit/deactivate)
- [ ] Route registry page (routes list + add/edit/delete)
- [ ] All list pages have search, empty states, and loading skeletons

### Phase 3 — Trip Core (Week 3–4)
- [ ] Trip creation Dialog with validation and auto-reference generation
- [ ] Trip detail page
- [ ] Trip status advancement (with timestamps)
- [ ] Trip cancellation
- [ ] Truck/driver busy enforcement in backend and UI

### Phase 4 — Operations Board (Week 4–5)
- [ ] Kanban board layout with 4 columns
- [ ] Trip cards with all required info
- [ ] Status advancement from card (with confirmation popover)
- [ ] Real-time column update after status change
- [ ] Summary counts in column headers
- [ ] "View All Delivered" link to history

### Phase 5 — History & Export (Week 5–6)
- [ ] Trip history page with table
- [ ] All filters: date range, status, truck, driver, route
- [ ] CSV export via Rust file dialog
- [ ] Trip detail view (read-only for completed trips)

### Phase 6 — Polish & QA (Week 6–7)
- [ ] Accessibility pass (all interactive elements keyboard-navigable)
- [ ] Empty states for all pages
- [ ] Error handling for all Tauri commands
- [ ] Performance testing (1000-row history query)
- [ ] End-to-end walkthrough on macOS, Windows, Linux

---

## 15. OPEN QUESTIONS

| # | Question | Owner | Status |
|---|---|---|---|
| Q1 | Should the Operations Board auto-refresh on a timer, or only refresh on user action? Recommendation: poll every 30 seconds. | Product Owner | Open |
| Q2 | What is the reference number format? Proposed: TRP-YYYY-NNN (e.g. TRP-2026-001, resets each year). | Product Owner | Open |
| Q3 | Should cancelled trips appear on the Kanban board (in a 5th column) or only in history? Recommendation: history only. | Product Owner | Open |
| Q4 | When a truck is marked Inactive, should its pending trips be auto-cancelled or just blocked from new assignments? Recommendation: admin must manually cancel active trips first. | Product Owner | Open |
| Q5 | Should the Delivered column on the Kanban board reset at midnight (showing only today), or should the admin manually archive? Recommendation: midnight reset, with history always accessible. | Product Owner | Open |
| Q6 | Is a route always required for a trip, or can a trip have a freetext destination without a pre-registered route? Recommendation: route required — forces clean data. | Product Owner | Open |

---

*End of PRD — SignalOS v2.0*
*Next document: Technical Architecture Doc (database schema, Tauri command list, frontend hook design)*