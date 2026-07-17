# TodoApp — CalDAV Task Manager PWA

Web-based task manager that talks to any CalDAV server (Radicale, Stalwart, Nextcloud, Baikal).\
Inspired by Tasks.org having no web UI.

**Live at** https://todos.antonshubin.com
**Public repo:** https://github.com/spy4x/caldav-tasks-web

---

## Stack

| Layer    | Tech                                                                |
| -------- | ------------------------------------------------------------------- |
| Frontend | Vite + Preact, Tailwind v4, wouter-preact, **preact-signals**       |
| API      | Hono (REST), CQRS-ready (`libs/shared/cqrs/`)                       |
| DB       | SQLite via `@db/sqlite` FFI (swappable to Postgres via `DbService`) |
| CalDAV   | Custom client — PROPFIND, GET, PUT, DELETE, MKCOL, PROPPATCH        |
| Auth     | PBKDF2 + pepper, HttpOnly session cookies                           |
| Deploy   | `rsync` → Docker Compose on homelab (Traefik, TLS)                  |

## Quick Start

```bash
# Prerequisites: Deno 2.2+, SQLite dev lib

cp .env.example .env          # edit secrets (AUTH_PEPPER, etc.)
deno task db:migrate          # create SQLite schema
deno task dev                 # starts API (:8080) + frontend (:5173)
```

Open http://localhost:5173 — sign up, add a CalDAV server, manage todos.

## Tasks

| Command                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `deno task dev`        | Run API + frontend in parallel (watch mode)                     |
| `deno task api:dev`    | API only, `--watch`                                             |
| `deno task web:dev`    | Vite dev server for frontend                                    |
| `deno task web:build`  | Production frontend bundle → `apps/web/dist/`                   |
| `deno task db:migrate` | Run SQLite migrations                                           |
| `deno task deploy`     | Build frontend, rsync to server, `docker compose up -d --build` |
| `deno task check`      | fmt + lint + typecheck                                          |
| `deno task fix`        | fmt + lint --fix                                                |

## Deploy

```bash
deno task web:build          # must be run first (deploy depends on it)
deno task deploy             # reads SSH_TO_SERVER / PATH_ON_SERVER from infra/envs/.env.prod
```

The deploy script:

1. `rsync` project files to the remote homelab (excluding `node_modules`, `data/`, etc.)
2. `ssh` → `docker compose up -d --build` on the remote

Infrastructure:

- `compose.yml` — Traefik labels, TLS via Let's Encrypt
- `Dockerfile` — `denoland/deno:debian-2.2.0` + `libsqlite3-dev`
- `infra/envs/.env.prod` — production secrets (gitignored)

## Environment Variables

See `.env.example`:

| Var                  | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `ENV`                | `dev` or `prod`                                    |
| `PORT`               | API listen port (default 8080)                     |
| `DB_PATH`            | SQLite file path                                   |
| `AUTH_PEPPER`        | PBKDF2 pepper for password hashing                 |
| `AUTH_COOKIE_SECRET` | Session cookie signing key                         |
| `ENCRYPTION_SECRET`  | AES-GCM key for server credentials at rest         |
| `CORS_ORIGIN`        | Allowed CORS origin (e.g. `http://localhost:5173`) |

## Project Layout

```
todoapp/
├── apps/api/              Hono REST API (routes, services, middleware)
├── apps/web/              Preact PWA (Vite, Tailwind, static/)
├── libs/server/db/        SQLite wrapper + migrations
├── libs/shared/           Types, helpers (hash, encrypt), CQRS buses
├── infra/                 Deploy script, rsync lists, .env.prod
├── docs/                   Architecture docs
├── compose.yml            Docker Compose with Traefik
├── Dockerfile             Deno debian image + sqlite-dev
└── deno.json              Workspace tasks, imports, config
```

## Architecture Notes

- **CQRS** — Business logic uses command/query buses in `libs/shared/cqrs/`.
- **Fail-open** — Calls to non-critical external services guarded with `|| true`.
- **preact-signals** — No React hooks; state lives in signals (`apps/web/src/state/+index.ts`).
- **DbService abstraction** — DB access goes through `DbService`; swap SQLite for Postgres by changing one implementation.
- **CalDAV specifics** — Radicale uses default XML namespace (no `d:` prefix); all parsers use `(?:d:)?` regex. VTODO bodies fetched via GET on `.ics` files (not inline in PROPFIND).

## Status

Fully functional MVP deployed. See [`todos.md`](todos.md) for backlog, known issues, and roadmap.
