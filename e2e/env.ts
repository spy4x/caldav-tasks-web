/** Where the app under test listens. */
export const APP_URL = `http://localhost:8080`

/** Where Radicale listens: `deno task radicale:up` locally, a service container in CI. */
export const RADICALE_URL = Deno.env.get("RADICALE_URL") ?? `http://localhost:5232`

/** The account on Radicale. Radicale in `infra/compose.dev.yml` accepts any user and password. */
export const CALDAV_USERNAME = `e2e`
export const CALDAV_PASSWORD = `e2e-not-a-real-password`

/** The owner password the e2e server accepts. A fixed test value, not a credential. */
export const OWNER_PASSWORD = `e2e-owner-password`

const AUTH_PEPPER = `e2e-pepper-e2e-pepper-e2e-pepper`

/**
 * `OWNER_PASSWORD` hashed with `AUTH_PEPPER` at 100,000 iterations, the lowest the hasher accepts, so
 * each e2e sign-in stays fast. `deno task password:hash` uses the hasher's default of 600,000.
 */
const OWNER_PASSWORD_HASH =
  `pbkdf2-sha256$100000$9342ac26ee1f7b80734af4653441a507$0461fea3b8bade3d56455fbb9e7aa8ca6778f38f87370233e158da4de9f6843b`

/**
 * The environment the server under test starts with: the seven variables it requires. The values
 * are fixed test values, not credentials.
 */
export function serverEnv(): Record<string, string> {
  return {
    PUBLIC_URL: APP_URL,
    CALDAV_URL: RADICALE_URL,
    CALDAV_USERNAME,
    CALDAV_PASSWORD,
    OWNER_PASSWORD_HASH: OWNER_PASSWORD_HASH,
    AUTH_PEPPER: AUTH_PEPPER,
    SESSION_SECRET: `e2e-secret-e2e-secret-e2e-secret`,
  }
}
