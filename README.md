# caldav-tasks-web

[![CI](https://ci.antonshubin.com/api/badges/14/status.svg)](https://ci.antonshubin.com/repos/spy4x/caldav-tasks-web)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A web companion to [Tasks.org](https://tasks.org/) for your own CalDAV server.** Open your task
lists in a browser (tested in Chromium), on the same server your phone syncs with. One install serves one person.

<!-- Video demo goes here once recorded: https://github.com/spy4x/caldav-tasks-web/issues/39 -->

## Who it is for

You run a CalDAV server (Radicale or Stalwart are the ones this was built against), you use
Tasks.org on Android, and you want the same lists on a computer without a second account or a
second copy of your data. It is not a hosted service and has no sign-up: you run the container, you
are the only user.

The server only relays. Your tasks stay on your CalDAV server, and the app writes them back in the
form Tasks.org wrote them, so nothing the phone stored is lost when you edit in the browser.

## What it does

- Lists, Today (overdue and due today), Upcoming (the next 14 days) and Search over titles, notes
  and tags, across all lists.
- Add, edit, complete, delete and undo. A quick-add line understands a tag, a time and a priority.
- Subtasks, tags, priority, due and start dates, notes and manual order by drag or keyboard.
- Repeating tasks: daily, weekly, monthly or yearly, every N, on chosen weekdays, ending never, on
  a date or after a number of times.
- Create, rename, recolour and delete lists (while connected).
- Works offline: the last copy is cached, edits made offline are queued and sent when the network
  returns, and an edit that clashes with a change made elsewhere asks you to keep yours or use theirs.
- Installs as an app (a web app manifest and a service worker).
- Keyboard shortcuts; press `?` to see them.
- Reminder notifications by Web Push, for the reminders Tasks.org stores on a task. Off until you
  set it up: see [docs/self-hosting.md](docs/self-hosting.md#reminder-notifications).

## Run it

You need a CalDAV account and a way to put the app behind HTTPS. Sign-in uses a `__Host-` cookie,
and the service worker, install and notifications need a secure origin, so a plain `http://` address
works only on `localhost`.

First make the password hash (this step needs [Deno](https://deno.com/) 2 and a clone of this
repo, because the image does not carry the script; so do the notification keys, if you want them):

```bash
git clone https://github.com/spy4x/caldav-tasks-web && cd caldav-tasks-web
echo "AUTH_PEPPER=$(openssl rand -base64 32)" > .env
deno task password:hash     # type your sign-in password; it prints the hash
```

Keep the `AUTH_PEPPER` value: the server needs the same one. Then start the container. Single quotes
matter around the hash, because it contains `$`:

```bash
docker run -d --name caldav-tasks-web --restart unless-stopped -p 8080:8080 \
  -e PUBLIC_URL=https://tasks.example.com \
  -e CALDAV_URL=https://caldav.example.com \
  -e CALDAV_USERNAME='<your CalDAV username>' \
  -e CALDAV_PASSWORD='<your CalDAV password>' \
  -e OWNER_PASSWORD_HASH='<your password hash>' \
  -e AUTH_PEPPER='<the AUTH_PEPPER from .env>' \
  -e SESSION_SECRET='<a random string of 32 or more characters>' \
  antonshubin/caldav-tasks-web:latest
```

For a real install, pin a release tag such as `v1.7.0` instead of `latest`.

Make the random strings with `openssl rand -base64 32`, once, and keep them: changing
`SESSION_SECRET` signs everyone out.

The image is `linux/amd64`, listens on port 8080 and runs as a non-root user. Put your reverse proxy
in front of that port; see [docs/self-hosting.md](docs/self-hosting.md). `GET /health` answers
`{"status":"ok"}`.

### Variables

All seven are required; the server refuses to start and names the ones that are missing or wrong.

| Variable              | What it is                                                                   |
| --------------------- | ---------------------------------------------------------------------------- |
| `PUBLIC_URL`          | The address you open the app at, such as `https://tasks.example.com`.        |
| `CALDAV_URL`          | Your CalDAV server's public address. Credentials are sent to this origin.    |
| `CALDAV_USERNAME`     | The CalDAV account the app uses.                                             |
| `CALDAV_PASSWORD`     | That account's password (an app password if the server offers them).         |
| `OWNER_PASSWORD_HASH` | The hash of the password you sign in to this app with.                       |
| `AUTH_PEPPER`         | At least 32 characters. Used when hashing and checking the sign-in password. |
| `SESSION_SECRET`      | At least 32 characters. Signs the session cookie.                            |

Reminder notifications are an optional group of five more: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `DATA_DIR` and `REMINDER_TIME_ZONE`. Set all five or none. The guide shows how.

## Documentation

- [Self-hosting](docs/self-hosting.md): hash and secrets, reverse proxy, extra sign-in in front,
  notifications, upgrading and backups.
- [Architecture](docs/architecture.md): how the relay, the lossless edit, the offline queue and the
  reminder runner work, and what is left out on purpose.
- [Compatibility](docs/compatibility.md): which CalDAV servers and clients were tested, and which
  were not.

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
