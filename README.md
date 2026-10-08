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

## Signing in

The app has one owner and one password. Set it up once:

1. Put a random `AUTH_PEPPER` and `SESSION_SECRET` (32 characters or more each) in `.env`.
2. Run `deno task password:hash`, type the password, and put the printed line in `.env` as
   `OWNER_PASSWORD_HASH`.

A sign-in lasts 30 days on that device. What ends sessions:

- **Signing out** ends the session on this device only. Other devices stay signed in.
- **Changing the password** (a new `OWNER_PASSWORD_HASH`, then a restart) ends every session.
- **Rotating `SESSION_SECRET`** (then a restart) ends every session too.

Wrong passwords are counted per client address, and IPv6 addresses are grouped by their /64
network. After 6 wrong passwords that address is locked for 15 minutes, and each further lock
doubles, up to a day. There is also a lock for all addresses together: after 30 wrong passwords
nobody can sign in for a minute, doubling up to an hour, though devices already signed in keep
working. This stops a guesser who rotates addresses, at a price: someone with several addresses can
keep that overall lock on and keep you out. Restarting the server clears every lock, because the
counts live in memory.

Behind a reverse proxy, the server reads the client address from `X-Real-IP`, and believes it only
when the proxy connects from a private or loopback address. Traefik sends it by default.

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
