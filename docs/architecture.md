# Architecture

How caldav-tasks-web is built: the stack, the repository layout and the design decisions behind
them. For the original design notes, see [`1.overview.md`](1.overview.md).

## Stack

| Layer    | Tech                                                  |
| -------- | ----------------------------------------------------- |
| Runtime  | Deno 2.2 — single binary, no Node                     |
| API      | Hono, CQRS-ready bus in `libs/shared/cqrs/`           |
| Frontend | Preact + Signals (no hooks), Tailwind v4, Vite        |
| DB       | SQLite via `@db/sqlite` FFI                           |
| CalDAV   | Adapter layer in `apps/api/services/caldav/`          |
| Auth     | PBKDF2 with pepper, HttpOnly session cookies          |
| Deploy   | `rsync` to homelab, then Docker Compose under Traefik |

## Project layout

```
apps/api/         Hono API, CalDAV adapters, middleware
apps/web/         Preact PWA (components, pages, signals)
libs/server/db/   SQLite wrapper + migrations
libs/shared/      Types, helpers, CQRS buses
infra/            Deploy scripts, env templates, rsync config
docs/             Architecture overview
```

## Architecture notes

- **CQRS** — business logic uses command / query buses in
  `libs/shared/cqrs/`. Not over-engineered for the current scope, but
  no big refactor when features grow.
- **CalDAV adapter layer** — `CalDAVAdapter` interface in
  `apps/api/services/caldav/+index.ts`. Today's implementations:
  `RadicaleAdapter`, `StalwartAdapter`. Adding a new server is one
  class, not a chain of `if (serverType === ...)` blocks.
- **preact-signals, not hooks** — state lives in signals, components
  subscribe explicitly, no virtual DOM tree of hooks.
- **SQLite, swappable** — `DbService` is the abstraction. Postgres is
  one implementation away.
- **Fail-open** — non-critical external calls (analytics, monitoring)
  guarded with `|| true`. Primary operations never block on
  auxiliaries.
