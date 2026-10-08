# caldav-tasks-web AGENTS.md

## Context

caldav-tasks-web is a single-user, self-hosted web companion to Tasks.org. One install serves one
person and talks to one CalDAV server (Stalwart, Radicale or Nextcloud) whose address and
credentials come from the environment. The v1 rewrite is in progress; the README claims only what
is built. Public repo: https://github.com/spy4x/caldav-tasks-web

## Architecture

- The browser (Preact SPA) talks JSON plus raw iCalendar text to a thin Hono server in one
  container; the server talks CalDAV. The browser never sees the CalDAV password.
- The server never parses a task. The browser reads, patches and creates tasks with
  `@spy4x/time/ical` and caches `{ href, etag, ics }` in IndexedDB. Every edit patches the original
  text, so nothing Tasks.org or another client wrote is dropped.
- No server-side database. Sign-in is one owner password and a signed, expiring session cookie.
- "Tasks.org semantics": a list is a CalDAV calendar, a tag is a `CATEGORIES` value, a subtask
  links to its parent with `RELATED-TO` (`RELTYPE=PARENT`), manual order is `X-APPLE-SORT-ORDER`,
  priority is 1 (high), 5 (medium), 9 (low) or 0 (none), and a repeating task is one VTODO whose
  dates move on completion.

## Layout

```
deno.jsonc            workspace, tasks, pinned imports. deno.lock is committed.
apps/server/          Hono: +main.ts (entry, `deno serve`), config.ts, app.ts
apps/web/             Preact SPA: index.html, vite.config.ts, src/main.tsx, src/app.tsx
libs/api/             JSON contract between server and SPA (arktype schemas and types)
libs/tasks/           task types and pure task logic
libs/ui/              screens: pure, props in and callbacks out
e2e/                  Playwright; fixtures seed Radicale
tests/                guard tests: ui-boundary and spacing
infra/compose.dev.yml Radicale for development and e2e
.woodpecker/ci.yml    check, build, e2e on pull requests and main
```

Aliases: `@api/` is `libs/api/`, `@tasks/` is `libs/tasks/`, `@ui/` is `libs/ui/`.

## Commands

Use the names in `deno.jsonc`; never guess one.

| Task                                      | What it does                                                  |
| ----------------------------------------- | ------------------------------------------------------------- |
| `deno task check`                         | lint, format check, type check, tests. Run before every push. |
| `deno task dev`                           | server on :8080 and Vite on :5173 (needs `.env`)              |
| `deno task build`                         | builds the SPA into `apps/web/dist`                           |
| `deno task start`                         | runs the server the way the container does                    |
| `deno task radicale:up` / `radicale:down` | Radicale at :5232                                             |
| `deno task e2e`                           | Playwright against the built app and Radicale                 |
| `deno task env:decrypt` / `env:encrypt`   | age64 `.env` handling                                         |

## Rules

- **Configuration:** all seven variables in `.env.example` are required. The server exits naming
  each missing one. No fallbacks, no development defaults. `.env.example` holds placeholders only.
- **Screens in `libs/ui` are pure.** They import no store, router, `fetch` or app code
  (`tests/ui-boundary.test.ts` enforces it). Wiring lives in `apps/web/src`.
- **Spacing** uses the scale of `@spy4x/preact-theme/spacing` (`tests/spacing.test.ts`).
- **Type checking** is plain `deno check`, which covers `.tsx`.
- **Shared libraries first.** Before writing a component or helper, search the lists in the section
  below. If it is missing, file the issue in the library and wait for the release; do not keep a
  local copy.
- **Errors never carry a credential.** No response body, log line or error message may hold
  `CALDAV_PASSWORD` or any other secret.

## Shared libraries

Before writing a component, helper or library here, search
[spy4x/ts-libs](https://github.com/spy4x/ts-libs) and
[spy4x/preact-components](https://github.com/spy4x/preact-components) for it. The global rule
["Shared libs before local code"](https://github.com/spy4x/dotfiles/blob/main/ai-harnesses/AGENTS.md)
says what belongs in each library; code only this repo needs stays here.
