# Self-hosting

How to run caldav-tasks-web on your own server, and every environment variable it reads. For a
local run, see the [quick start](../README.md#quick-start).

## Production deploy

Comes with a `Dockerfile` and `compose.yml` wired for Traefik and
Let's Encrypt. `deno task deploy` does the whole loop:

1. Build the frontend
2. Rsync to the homelab (SSH target in `infra/envs/.env.prod`)
3. `docker compose up -d --build` on the remote

See [`architecture.md`](architecture.md) and [`1.overview.md`](1.overview.md) for the full
architecture.

Place your production secrets directly on the deploy target (the repo
does not store them — `.env.prod` is gitignored and a template lives at
`infra/envs/.env.prod.example`).

## Environment variables

| Var                  | Purpose                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `AUTH_PEPPER`        | PBKDF2 pepper for password hashing                                                        |
| `AUTH_COOKIE_SECRET` | Session cookie signing key                                                                |
| `ENCRYPTION_SECRET`  | AES-GCM key for CalDAV passwords at rest                                                  |
| `DB_PATH`            | SQLite file path (default `./data/todoapp.db`)                                            |
| `CORS_ORIGIN`        | Allowed frontend origin                                                                   |
| `COOKIE_INSECURE`    | Set to `1` for local HTTP testing only (escape hatch for headless screenshot scripts, CI) |

Production needs all three secrets. See `.env.example` and
`infra/envs/.env.prod.example` for placeholders.
