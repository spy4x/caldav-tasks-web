# caldav-tasks-web

**Rewrite in progress; v1 not released.**

caldav-tasks-web is meant to be a web companion to [Tasks.org](https://tasks.org/): one install
serves one person and talks to one CalDAV server. The first version is being built from scratch, so
nothing here is usable yet and there is no demo.

## What exists today

The skeleton the rest of v1 is built on:

- a Hono server that answers `/health` and serves the built web app,
- a Preact web app with five empty pages: Today, Upcoming, Lists, Search and More,
- tests, a Playwright smoke test against Radicale and a Dockerfile.

## Development

You need [Deno](https://deno.com/) 2 and Docker.

```bash
cp .env.example .env     # then fill in the values
deno task radicale:up    # a local CalDAV server at http://localhost:5232
deno task dev            # server on :8080, web app on http://localhost:5173
deno task check          # lint, format, type check, tests
```

`deno task build` builds the web app and `deno task e2e` runs the browser tests against it. More in
[CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability privately, see
[SECURITY.md](SECURITY.md).

Licensed under [MIT](LICENSE). Copyright (c) 2026 Anton Shubin.
