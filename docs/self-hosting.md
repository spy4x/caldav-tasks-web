# Self-hosting

This guide takes you from "I have a CalDAV server" to a running install behind HTTPS. The
[README](../README.md) has the short version. All addresses below use `example.com`; replace them
with yours.

## What you need

- A CalDAV server with a task list you already use, such as Radicale or Stalwart.
- A host that runs Docker, and a way to give the app an `https://` address. The session cookie is
  named `__Host-session`, which browsers accept only over HTTPS (or on `localhost`), and the service
  worker, the install prompt and push all need a secure origin too.
- For the password hash, and for the notification keys if you want notifications, [Deno](https://deno.com/)
  2 and a clone of this repository (below).

## The password hash and the two secrets

The app has one owner and one sign-in password. The server never stores the password, only a hash
of it, made with a key called the pepper.

1. Make the pepper and the session secret: two random strings of 32 or more characters each.
   `openssl rand -base64 32` makes one. Keep both somewhere safe, with your other server secrets.
2. Put the pepper in a `.env` file in a clone of this repository, then hash your password:

   ```bash
   git clone https://github.com/spy4x/caldav-tasks-web && cd caldav-tasks-web
   echo "AUTH_PEPPER=<the pepper>" > .env
   deno task password:hash
   ```

   Type the password (it is not shown). The command prints one line that starts with
   `pbkdf2-sha256$`. That line is `OWNER_PASSWORD_HASH`. To script it, pipe the password in:
   `printf %s "$PASSWORD" | deno task password:hash`.

3. Give the container `AUTH_PEPPER` (the same one), `SESSION_SECRET` and `OWNER_PASSWORD_HASH`.

The hash contains `$` characters. In a shell, wrap it in single quotes. In a `compose.yml`, write
each `$` as `$$`. A hash made with one pepper does not verify under another, so changing
`AUTH_PEPPER` locks you out until you make a new hash.

A complete `compose.yml`:

```yaml
services:
  caldav-tasks-web:
    image: antonshubin/caldav-tasks-web:v1.7.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - data:/data # only used by notifications; see below
    environment:
      PUBLIC_URL: https://tasks.example.com
      CALDAV_URL: https://caldav.example.com
      CALDAV_USERNAME: <your CalDAV username>
      CALDAV_PASSWORD: ${CALDAV_PASSWORD}
      # Every "$" in the hash is written "$$" in a compose file.
      OWNER_PASSWORD_HASH: pbkdf2-sha256$$600000$$<salt>$$<hash>
      AUTH_PEPPER: ${AUTH_PEPPER}
      SESSION_SECRET: ${SESSION_SECRET}
volumes:
  data:
```

Put `CALDAV_PASSWORD`, `AUTH_PEPPER` and `SESSION_SECRET` in a `.env` file next to it, which
Compose reads. Do not commit that file.

## CALDAV_URL

`CALDAV_URL` is the address this app's server uses to reach your CalDAV server. Any address the
container can reach works: the public `https://` address, or, when both run on one Docker network,
the container's name. For Stalwart, use the mail host's address, such as `https://mail.example.com`.
The username and password are sent to that address only, and the browser never sees them.

## Behind a reverse proxy

Run the container on a port that only the proxy can reach (the compose file above binds it to
`127.0.0.1`), and let the proxy terminate HTTPS and forward every path to port 8080.

- **`PUBLIC_URL` must equal the address in the browser**: same scheme, host and port. The server
  refuses a sign-in or a write that does not come from that origin (`403`, "Cross-site request
  refused"). A request from a script has to send what a browser sends: with `curl`, add
  `-H 'Origin: https://tasks.example.com' -H 'Sec-Fetch-Site: same-origin'`.
- **Forward `X-Real-IP`** with the client's address. Wrong sign-in attempts are counted per client
  address, and the server believes the header only when the proxy connects from a private or
  loopback address. Traefik sends it by default. Without it, every visitor counts as the proxy's
  address.
- `GET /health` answers `{"status":"ok"}` and needs no sign-in. The image also has a Docker
  `HEALTHCHECK` that calls it.

Wrong sign-in passwords are counted in memory: after 6 wrong passwords an address is locked for 15
minutes, and each further lock doubles, up to a day. From the 31st wrong password across all
addresses, nobody can sign in for a minute, doubling up to an hour, though devices already signed in
keep working. A restart clears the counts.

## Another sign-in in front

You can put your own sign-in in front of the app (Authelia, an SSO proxy, HTTP basic auth). The app
then asks for its own password as well. This has not been tested here with any particular tool. What
to watch for: the app's page, `/sw.js`, the manifest and `/api` must all pass through for a person
who is signed in to the front layer, and a background request that the front layer answers with a
redirect to its login page will show up as an error in the app. Leave `GET /health` reachable from
your monitoring, or check it on the container's own port.

## Signing out everywhere

A sign-in lasts 30 days on that device. What ends sessions:

- **Sign out** in Settings ends the session on that device only. The server remembers signed-out
  sessions in memory, so after a restart a copied cookie works again until its 30 days run out.
- **Changing `SESSION_SECRET`** and restarting the container ends every session on every device,
  for good. Use this if a phone is lost.
- **Changing the password** (a new `OWNER_PASSWORD_HASH`, then a restart) ends every session too,
  because sessions are tied to the hash.

## Reminder notifications

Notifications are off until you set them up. The app sends the reminders that Tasks.org stores on
a task (and the ones you add in the browser), to every browser where you turned notifications on in
Settings. It needs five variables, all or none:

| Variable             | What it is                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `VAPID_PUBLIC_KEY`   | The public half of the key pair the server signs each push with.                                                         |
| `VAPID_PRIVATE_KEY`  | The private half. A secret.                                                                                              |
| `VAPID_SUBJECT`      | How a push service can reach you: a `mailto:` or `https:` address.                                                       |
| `DATA_DIR`           | The folder the server may write. In the container, `/data`.                                                              |
| `REMINDER_TIME_ZONE` | Your IANA zone, such as `Europe/Berlin`. A reminder on a task that has a date and no time arrives at 09:00 in this zone. |

With only some set, the server refuses to start and names the missing ones.

1. **Make the keys.** In your clone, run `deno task vapid:keys mailto:you@example.com --print`. It
   prints `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Without `--print` it writes
   them into `.env` instead. Keep the private key secret, and keep the pair: new keys end every
   device's subscription, and each device subscribes again the next time the app is opened on it.
2. **Mount `/data`** and set `DATA_DIR=/data`. The container runs as the user `deno` (uid and gid
   1993) unless you set another with `--user`. A new named volume takes its owner from the image and
   works for any user. A folder you mount from the host keeps its own owner, so give it to the user
   the container runs as: `chown 1993:1993 /srv/caldav-tasks-web/data`.
3. **Set `REMINDER_TIME_ZONE`** and start the container.
4. **Turn it on per device** in Settings, Notifications.

If the folder or the file in it cannot be used, the server says so in one log line and runs with
notifications off; the tasks keep working.

**What the server stores.** One file, `push.json` in `DATA_DIR`: each device's push subscription
(the address of its push service and two keys), and for each reminder sent in the last hour the
task's id and the reminder's time, so none is sent twice. No task text. A notification carries the
task's title, encrypted for that device, through the browser vendor's push service. Once a minute
the server reads your open tasks over CalDAV to find reminders that came due; it never writes a task.

The server sends a push only to an `https` address on a public host. It checks this when a device
subscribes and again before each send. Only the signed-in owner can add an address. The check has
two known gaps: a host name that changes its answer between the check and the connection is not
caught, and any port on a public host is accepted.

**iPhone and iPad.** Notifications work only after you add the app to the Home Screen (Share, then
Add to Home Screen) and open it from there. Settings says so when that is the case.

## Upgrading and rolling back

Images are tagged by release: `antonshubin/caldav-tasks-web:v1.7.0`, and `latest` for the newest
release (a pre-release such as `v1.8.0-rc.1` never moves `latest`). Pin the tag you run, rather than `latest`.

```bash
# Upgrade: change the tag in compose.yml, then
docker compose pull && docker compose up -d
# Roll back: put the old tag back, then the same two commands.
```

With `docker run`, stop and remove the container (`docker rm -f caldav-tasks-web`), then run the
same command with the new tag. There is no database to migrate. The one file the server writes,
`push.json`, stays in the `/data` volume across upgrades. A device that has the app open shows a
"New version available" bar when a new version is waiting. Settings shows the version you run.

## What to back up

Nothing but your configuration. Your tasks live on your CalDAV server, so back that up the way you
already do. The browser keeps a cache of them and a queue of unsent edits, and the server keeps
nothing else. If you lose `push.json`, each device turns notifications on again. If you lose the
environment, you can make a new hash and secrets, and everyone signs in again.
