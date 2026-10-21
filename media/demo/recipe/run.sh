#!/usr/bin/env bash
# Remakes the demo video end to end (`deno task demo-video` runs this from the repository root).
#
# It starts a throwaway Radicale, seeds it with made-up lists (seed.ts), builds this checkout,
# starts the server with the fixed test values of e2e/env.ts, records one take (record.ts) into
# media/demo/.take/ (gitignored, kept for `deno task demo-video:encode`), then encodes the four
# outputs into media/demo/ (encode-take.ts). Radicale, the server and the temp folder are removed
# on success and on failure.
set -euo pipefail

RADICALE_PORT="${RADICALE_PORT:-35466}"
APP_PORT="${APP_PORT:-38466}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TAKE="$ROOT/media/demo/.take"
WORK="$(mktemp -d)"
NAME="demo-video-radicale-$$"
SERVER=""

cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  find "$WORK" -delete 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Waits up to 60 s for a URL to answer 200.
wait_for() {
  for _ in $(seq 60); do
    curl -fsS -o /dev/null "$1" && return 0
    sleep 1
  done
  echo "no answer from $1" >&2
  return 1
}

docker run -d --rm --name "$NAME" --pids-limit=500 --memory=8g \
  -p "127.0.0.1:$RADICALE_PORT:5232" \
  ghcr.io/kozea/radicale:3.5.4 --hosts 0.0.0.0:5232 --auth-type none >/dev/null
wait_for "http://127.0.0.1:$RADICALE_PORT/.web/"
deno run --allow-net="127.0.0.1:$RADICALE_PORT" "$HERE/seed.ts" \
  "http://127.0.0.1:$RADICALE_PORT" demo

(cd "$ROOT" && timeout 900 deno task build >/dev/null)

# The e2e server's fixed test values: an owner password hash, a pepper and a session key.
ENV_JS='const { serverEnv } = await import(Deno.args[0]); const e = serverEnv()
console.log(e.OWNER_PASSWORD_HASH); console.log(e.AUTH_PEPPER); console.log(e.SESSION_SECRET)'
{
  read -r HASH
  read -r PEPPER
  read -r SECRET
} < <(cd "$ROOT" && deno eval "$ENV_JS" "$ROOT/e2e/env.ts")

(
  cd "$ROOT"
  PUBLIC_URL="http://localhost:$APP_PORT" CALDAV_URL="http://127.0.0.1:$RADICALE_PORT" \
    CALDAV_USERNAME=demo CALDAV_PASSWORD=demo OWNER_PASSWORD_HASH="$HASH" \
    AUTH_PEPPER="$PEPPER" SESSION_SECRET="$SECRET" \
    exec timeout 900 deno serve --allow-net --allow-env --allow-read=apps/web/dist \
    --port "$APP_PORT" apps/server/+main.ts
) >"$WORK/server.log" 2>&1 &
SERVER=$!
wait_for "http://localhost:$APP_PORT/health"

(cd "$ROOT" && timeout 600 deno run -A "$HERE/record.ts" "http://localhost:$APP_PORT" "$TAKE")
(cd "$ROOT" && deno task demo-video:encode)
