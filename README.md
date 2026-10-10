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

- **Signing out** ends the session on this device only. Other devices stay signed in. The server
  remembers signed-out sessions in memory, so after a restart a copied cookie works again until its
  30 days run out; rotate `SESSION_SECRET` to be sure.
- **Changing the password** (a new `OWNER_PASSWORD_HASH`, then a restart) ends every session.
- **Rotating `SESSION_SECRET`** (then a restart) ends every session too.

Wrong passwords are counted per client address, and IPv6 addresses are grouped by their /64
network. After 6 wrong passwords that address is locked for 15 minutes, and each further lock
doubles, up to a day. There is also a lock for all addresses together: from the 31st wrong password
nobody can sign in for a minute, doubling up to an hour, though devices already signed in keep
working. This stops a guesser who rotates addresses, at a price: someone with several addresses can
keep that overall lock on and keep you out. Restarting the server clears every lock, because the
counts live in memory.

Behind a reverse proxy, the server reads the client address from `X-Real-IP`, and believes it only
when the proxy connects from a private or loopback address. Traefik sends it by default.

## Notifications

The app can remind you of a task on each device where you turn notifications on, in Settings. It
sends what Tasks.org stores as the task's reminders, so a reminder set on the phone also arrives in
the browser.

It is off until the server has push keys. To set it up:

1. Run `deno task vapid:keys mailto:you@example.com`. It writes `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` into `.env`. The address is how a push service can
   reach you. Keep the private key secret; new keys end every device's subscription.
2. Set `DATA_DIR` to a folder the server may write and that survives a restart: `data` in
   development, `/data` in the container, with a volume there. The volume must be writable by
   the user the container runs as: 1993 unless you set one. A new named volume is; a folder
   mounted from the host needs that owner. If the folder or the file in it cannot be used, the
   server says so in one log line and runs with notifications off.
3. Set `REMINDER_TIME_ZONE` to your IANA zone, such as `Europe/Berlin`. A reminder on a task with
   a date and no time arrives at 09:00 in this zone.

Set all five or none: with only some, the server refuses to start and names the missing ones.

What the server stores, in one file, `push.json` in `DATA_DIR`: each device's push subscription
(the address of its push service and two keys), and for each reminder sent in the last hour the
task's id and the reminder's time, so none is sent twice. It stores no task text. A notification carries the task's title, encrypted
for that device, through the browser vendor's push service.

The server sends only to a push address that is `https` and public, and checks that when a device
subscribes and again before each send. Two limits remain: a host name is looked up at each check
and again on the connection, so a name that answers differently in between gets past it, and any
port of a public host is accepted. Only the signed-in owner can add an address.

On an iPhone or iPad, notifications work only after you add the app to the Home Screen (Share,
then Add to Home Screen) and open it from there. Settings says so when that is the case.

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
