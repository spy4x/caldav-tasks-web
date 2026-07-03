# TodoApp — todos.md

Everything we know, everything planned. Updated as changes are made.

## Legend

- [x] Done
- [>] In progress
- [ ] Not started
- [?] Needs decision
- [!] Bug

## ✅ Completed

### Core (MVP)

- [x] Project scaffolding: deno.json, dirs, libs structure
- [x] SQLite DB service + migration runner
- [x] Hono REST API with CORS, request ID, auth parsing
- [x] Auth: sign-up, sign-in, sign-out, session cookies (PBKDF2 + pepper)
- [x] Radicale CalDAV client: PROPFIND, GET, PUT, DELETE
- [x] VTODO CRUD: create, list, update, delete via CalDAV
- [x] Server credentials: add, list, update, delete (AES-GCM encrypted)
- [x] PWA: manifest.json, service worker, offline caching of static assets
- [x] Frontend Vite+Preact build pipeline

### UI/UX v1

- [x] Login/signup form with toggle
- [x] Dashboard with server selector dropdown
- [x] Basic todo list with create form, toggle complete, delete
- [x] Servers management page (add/discover/select calendar)
- [x] Tailwind v4 styling (dark theme, slate-900)

### Deploy Infrastructure

- [x] rsync deploy script (same pattern as Financy)
- [x] docker compose with traefik labels
- [x] Dockerfile (debian image for glibc compatibility)
- [x] `.env.prod` with secrets
- [x] Domain: todos.antonshubin.com

### UI/UX v2 (Deployed 2026-06-19)

- [x] Sidebar with all collections per server
- [x] Search bar (real-time, summary/description/categories)
- [x] Filters: status, priority, show/hide completed
- [x] Sort: by priority/status/due date, asc/desc
- [x] Full todo edit dialog (all iCal fields)
- [x] Recurring tasks (RRULE presets)
- [x] Categories/tags display on todo items
- [x] Mobile-responsive sidebar with overlay
- [x] Delete confirmation dialogs (todos, servers, collections)
- [x] Collection CRUD: create (MKCOL), rename (PROPPATCH), delete (CalDAV DEL)
- [x] Profile settings: change email, change password
- [x] Collection colors in sidebar
- [x] Tags listed in sidebar per server
- [x] URL-first routing (state in query params)
- [x] Keyboard shortcuts with `?` help dialog
- [x] "+Add" button → full editor dialog
- [x] Click on todo row = edit (no separate edit button)
- [x] Delete button moved into editor form
- [x] Collection display name in header
- [x] Filter bar at top of sidebar
- [x] SVG loading spinner animation
- [x] Priority color-coded borders
- [x] Priority filter: "No priority" option, renamed labels
- [x] Multi-sort support
- [x] Auth separated from email (username can be any string, no @ required)
- [x] Profile: firstName + secondName fields
- [x] Split save buttons: Name+Email / Username (requires password) / Password
- [x] "Disconnect server" rename (was "Delete server")
- [x] Manifest served correctly (vite publicDir: 'static')
- [x] Calendar colors parsed from Radicale (ICAL:calendar-color)
- [x] Undone count shown per collection in sidebar
- [x] Search scope: this collection or all collections
- [x] Sidebar toggle works on all pages (sidebar in Layout, not per-page)
- [x] Username login (no email required for authentication)
- [x] Notification/Warning: old `admin@test.com` user migrated to `spy4x`

### Quick Fixes (2026-06-19)

- [x] **"Disconnect server" confirm text** — changed title to "Disconnect server?", body clarifies "removes credentials, no data changed"
- [x] **Desktop sidebar full height** — changed `min-h-full` → `min-h-screen` on outer container
- [x] **Sort: priority 0 last** — comparator now maps 0 to 999 (desc) / 0 (asc) so no priority always sorts last
- [x] **Search scope conditional** — "This/All collections" buttons only render when search query is non-empty
- [x] **Duplicate sidebar toggle removed** — removed extra ☰ button from Dashboard header
- [x] **Collections sorted by title** — added `.sort()` by `displayName` in sidebar rendering

### Quick Fixes (2026-06-19) — Part 2

- [x] **Editor: Enter submits form** — added `onKeyDown` handler on dialog content div
- [x] **Create todo 502 fixed** — root cause: DUE date passed as ISO string with hyphens/colons (`2026-06-20T23:59:59.000Z`) instead of iCal format (`20260620T235959Z`). Also fixed: empty DESCRIPTION line omitted, response body added to error for debugging
- [x] **Default collection auto-select** — when collections load and nothing selected, picks first server's first collection
- [x] **User icon in top bar** — email replaced with user avatar SVG + display name, links to /settings
- [x] **Pre-existing type fixes** — `collectionsByServer` removed from Sidebar import (didn't exist in state), `color` added to `parseCalendars` return type
- [x] **Login placeholder** — "spy4x" → "Your username"

### Quick Fixes (2026-06-19) — Part 3

- [x] **localStorage auth session** — skip `/api/auth/me` if no `userId` in localStorage; save on sign-in, clear on sign-out/401
- [x] **Sidebar collapsible on desktop** — toggle button persists to localStorage (`sidebar_collapsed`)
- [x] **startDate (DTSTART) now saves** — was displayed in editor but never sent to API; added via `TodoUpdate.startDate`
- [x] **Delete user (Danger Zone)** — `DELETE /auth/user` soft-deletes user, clears sessions; frontend button on Profile tab with confirmation

### Quick Fixes (2026-06-19) — Part 4

- [x] **Sidebar logic rewrite** — single `sidebarOpen` signal; desktop collapses to thin strip (w-12), mobile slides overlay; "B" hotkey works on all devices; header hamburger always visible; `bottom-0` added to `<aside>`
- [x] **Hide completed by default** — `showCompleted` defaults to `false`; completed section shown as collapsible "Completed (N) ▶" below active todos
- [x] **Kanban view** — toggle via button in dashboard header; 4 columns (Needs Action, In Progress, Completed, Cancelled); HTML5 drag-and-drop between columns; compact card with priority dot + categories
- [x] **Editor enhanced** — added "More fields" ▶ toggle with chevron; created timestamp/UID display; divider before advanced section
- [x] **Sidebar CRUD** — inline create collection form (+ New); hover actions on collections (rename ✏️, delete 🗑️); inline rename input; server disconnect link → /settings

## 📋 Bug Queue — To Fix Next

_No open bugs. All resolved._

### v3.5 — Stalwart Support (2026-07-03)

- [x] **Dual CalDAV support** — Added `ServerType.STALWART = 2` enum, created CalDAV adapter pattern (`apps/api/services/caldav/`) with `RadicaleAdapter` and `StalwartAdapter`, factory function `getAdapter(serverType)`.
- [x] **API routes refactored** — `servers.ts` and `todos.ts` now use adapter factory instead of direct `radicale.ts` imports.
- [x] **Shared parsing** — iCalendar parse/build utilities extracted to `caldav/parse.ts`, shared by both adapters.
- [x] **Server type autodetect** — Frontend form (Settings + Servers page) added server type dropdown (Radicale/Stalwart).
- [x] **DB migration** — `003_stalwart_type.sql` updates all existing `server_type=1` records to `server_type=2` (deployed app was already targeting Stalwart paths).
- [x] **Removed deprecated code** — Old `radicale.ts` deleted (fully replaced by `caldav/` module).
- [x] **Server type display** — Server list now shows "Stalwart" or "Radicale" label.
- [x] **User paths** — Radicale: `/<username>/`, Stalwart: `/dav/cal/<email>/`.
- **Tradeoff:** Adapter code is nearly identical for now (both use same CalDAV protocol). Abstraction is for future divergence (different auth, namespace handling, path structures). Minimal duplication justified by clean separation.

## 📋 Backlog

### v3 — Polish & UX (High Priority)

- [ ] **Toggle sidebar on desktop via icon** — thin sidebar strip currently shows ▶ button; consider making it always-visible narrow icon bar

### Medium Priority

- [ ] **Kanban view** — Drag-and-drop columns for status (Needs Action → In Progress → Completed)
- [ ] **Google Tasks compatibility** — Test against Google Tasks CalDAV API
- [ ] **Nextcloud Tasks / Baikal compatibility** — Test against other CalDAV implementations
- [ ] **Dark/light theme toggle**
- [ ] **Backup/restore** — Export all todos as .ics, import from .ics
- [ ] **Share todo** — Generate share link with read-only access
- [ ] **Attachments** — Support ATTACH iCal property
- [ ] **Time estimates** — Support DURATION iCal property
- [ ] **Subtasks** — Support RELATED-TO iCal property for parent-child

### Low Priority

- [ ] **Calendar view** — Month/week view alongside list
- [ ] **Stats dashboard** — Completion rates, trends, productivity metrics
- [ ] **Notifications via Telegram bot** — Like Financy
- [ ] **Email reminders** — Send reminders for due tasks
- [ ] **Capacitor wrapper** — Native Android/iOS via Capacitor

### Future (not this session)

- [ ] **Push notifications** — Web Push API for task reminders
- [ ] **Offline-first PWA** — IndexedDB (Dexie.js) for local cache, sync queue for offline mutations
- [ ] **Realtime sync** — WebSocket or SSE for multi-device sync

### Ideas / Questions

- [ ] **Custom statuses** — Are CalDAV statuses (NEEDS-ACTION, IN-PROCESS, COMPLETED, CANCELLED) static or extensible? Answer: Static per spec. Custom X-STATUS could be used.
- [ ] **Kanban columns** — Could use statuses as columns. CalDAV has only 4; custom X-STATUS might work.
- [ ] **Multi-user** — Shared task lists within a team?
- [ ] **WebDAV sync** — Direct file-system style sync instead of CalDAV?
- [ ] **Integrations** — Zapier/Make.com webhooks for todo creation?

## 🐛 Known Issues

_None. All resolved._

## 📝 Notes

### App Identity (2026-06-19)

- **Name**: TodoApp (working title)
- **Domain**: todos.antonshubin.com
- **Color scheme**: Dark theme (`bg-slate-900`, `bg-slate-800`, `border-slate-700`, `text-slate-100`), blue accent (`blue-600/500`), red for priority/danger, green for done
- **Icon**: None yet (just 📋 emoji)

### CalDAV Compatibility

Radicale serves CalDAV with default XML namespace (no `d:` prefix). Different servers:

- **Google Tasks**: Does NOT implement CalDAV for tasks. Uses proprietary GData/Google Tasks API. Would need separate adapter.
- **Tasks.org**: Fully CalDAV compatible, works with Radicale. Our app works with any Tasks.org-synced server.
- **Nextcloud Tasks**: CalDAV compliant. Should work with our client.
- **Baikal**: CalDAV compliant. Should work.
- **Standard**: CalDAV (RFC 4791) + iCalendar (RFC 5545) VTODO. Statuses are static per CalDAV spec: NEEDS-ACTION, IN-PROCESS, COMPLETED, CANCELLED.

### Why Create Todo Returns 502

The API returns "CalDAV PUT failed: 400 Bad Request" when creating a todo. The VTODO iCalendar payload is sent to Radicale via PUT but Radicale rejects it. Likely causes:

- Incorrect date format (DTSTAMP/CREATED with `Z` suffix vs without)
- Missing required fields (e.g., `DTSTART` for certain VTODO configurations)
- Newline encoding issues (`\r\n` vs `\n`)
  **Fix**: Check the exact iCalendar payload being sent. Test with a simple VTODO first, then add fields incrementally.

### Offline-First Cost

To make offline-first with realtime sync:

- Add Dexie.js (IndexedDB wrapper) — ~15KB gzipped
- Add sync queue for mutations when offline
- Add background sync via Service Worker
- Add conflict resolution (server-wins or last-write-wins)
- Total: moderate effort (~2-3 days for MVP offline support)

### N+1 for Collection Counts

Undone count per collection is computed **in-memory** from already-fetched todos (zero extra requests). The `undoneCounts` computed signal iterates `allTodos` — O(n) per render, no network cost.

### Are Statuses (NEEDS-ACTION, IN-PROCESS, COMPLETED, CANCELLED) Static?

Yes, per CalDAV spec (RFC 4791). Only these 4 are defined. The spec doesn't support custom statuses. Could use `X-STATUS` custom property for extended states but that breaks compatibility with CalDAV clients like Tasks.org. **Kanban UI** (columns = these 4 statuses, drag-and-drop between them) is feasible and spec-compliant.

### Calendar Colors

Radicale returns colors via `<ICAL:calendar-color>` property (Apple iCal namespace). Value is hex RGBA: `#RRGGBBAA`. Already parsed and displayed in sidebar.

### Radicale Webhooks / Real-time Notifications

**Radicale does NOT have webhooks or WebSocket support** for notifying about changes. It's a simple file-based CalDAV server. To get real-time updates:

- **Polling**: Periodically re-fetch todos (e.g., every 30s). Simple but inefficient.
- **Server-Sent Events (SSE)**: Our API could background-poll Radicale and push changes to the web client via SSE.
- **WebSocket**: Same as SSE but bidirectional. More complex.
- **Calendar sync** (CalDAV sync-collection REPORT): Radicale supports `sync-collection` REPORT which returns only changes since a sync token. This is the CalDAV-standard way to sync efficiently. Our API could store sync tokens per collection and poll them.

### Desktop Collapsible Sidebar

Desktop sidebar should have a toggle button (like hamburger menu) to collapse/expand it. State persists in localStorage (`sidebar_collapsed`). When collapsed, sidebar shrinks to icon-only or hides completely and shows a thin bar.

### Login Form Placeholder

Placeholder changed from "spy4x" to "Your username".

### Top Bar User Display

Replace email text with: User avatar icon (or initials circle) + display name (firstName + secondName, or email, or "You"). Clicking navigates to /profile. Sign Out button moves to /profile page only.
