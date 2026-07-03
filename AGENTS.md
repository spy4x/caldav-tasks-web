# TodoApp AGENTS.md

## Context

TodoApp is a CalDAV task manager PWA (Deno + Hono + Vite/Preact + SQLite).
Deployed at https://todos.antonshubin.com via `deno task deploy`.

## Core Rules

- **Deno-only.** No Node.js/bun. No npm except via `--node-modules-dir`.
- **Minimal third-party deps.** Prefer std lib. Document each dep.
- **preact-signals, not hooks.**
- **Money as ints, enums start at 1** (Financy conventions).
- **Fail-open:** non-critical external failures → `|| true`, never block.
- **CQRS** for business logic (buses in `libs/shared/cqrs/`).
- **SQLite** for now, but DB access must be through `DbService` (easy swap to Postgres later).

## Project State

See `README.md` for quick start, `docs/1.overview.md` for architecture and status.
**See `todos.md` for all known issues, bugs, ideas, and roadmap — this is the single source of truth for project status.**

**When working on the project, ALWAYS update `todos.md` with any new ideas, bugs discovered, or items completed. Move items from Backlog to Completed as they're done. Move items from Bug Queue to Fixed.**

## Workflow

```
/plan → /design → /tasks → /process → /review → /pr
```

1. First consult `todos.md` for existing issues and `docs/1.overview.md` for architecture.
2. Create branch for big changes.
3. Delegate tasks with exact deliverables, tests, acceptance criteria.
4. After merge, update `docs/` and `todos.md` (state who/where).
5. Run `deno task check` before committing.

## Key Files

| File                                         | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `apps/api/index.ts`                          | Hono server entry                                              |
| `apps/api/services/radicale.ts`              | CalDAV client (PROPFIND, MKCOL, PROPPATCH, PUT, DELETE)        |
| `apps/web/src/state/+index.ts`               | All preact-signals (state management, filters, sort, URL sync) |
| `apps/web/src/components/Sidebar.tsx`        | Sidebar with collections, search, filters, sorting, tags       |
| `apps/web/src/components/TodoEditDialog.tsx` | Full todo editor modal                                         |
| `apps/web/src/pages/Settings.tsx`            | Profile + server management (3 separate save forms)            |
| `libs/server/db/+index.ts`                   | SQLite wrapper + migrations                                    |
| `infra/scripts/deploy.ts`                    | rsync → docker compose                                         |
| `compose.yml`                                | Production compose with traefik                                |
| `Dockerfile`                                 | debian-2.2.0 + sqlite-dev                                      |

## Key Architecture Decisions

- **Username ≠ Email**: `user_keys.identification` = login (any string). `users.email` = contact. Separate endpoints for changing each.
- **CalDAV todos**: VTODO data is fetched via GET on each `.ics` file (not inline in PROPFIND). Some servers (like Radicale) return 404 for `calendar-data` in PROPFIND.
- **XML namespace**: Radicale uses default namespace (no `d:` prefix). All regex parsers use `(?:d:)?` and `(?:[^:]*:)?` to handle both prefixed and unprefixed tags.
- **URL-first state**: Filters, search, sort, selected collection stored in URL query params. Restored on page load.
- **Collection colors**: Parsed from `<ICAL:calendar-color>` in PROPFIND response.
- **Encryption at rest**: Server passwords encrypted with AES-GCM using `ENCRYPTION_SECRET` env var.

## Troubleshooting

- **Create todo returns 502 / CalDAV PUT 400**: Check iCalendar date format. Radicale may reject `Z` suffix in DTSTAMP or missing `DTSTART`. Test with minimal VTODO first.
- **manifest.json error in console:** Files are in `apps/web/static/`, Vite's `publicDir` is set to `static/` in vite.config.ts.
- **Container won't start:** `@db/sqlite` needs SQLite shared lib. Debian image has it via `apt-get install libsqlite3-dev`.
- **CalDAV returns empty:** Radicale returns VTODO data via GET on `.ics` files, not inline in PROPFIND. The function `caldavGetTodos` first lists .ics files then fetches each individually.
- **XML parsing fails:** Radicale uses default XML namespace (no `d:` prefix). All regex parsers use `(?:d:)?` to handle both.
- **Sidebar not showing on Settings:** Ensure Sidebar component is rendered inside Layout (not per-page). It should be in Layout.tsx, not Dashboard.tsx.
