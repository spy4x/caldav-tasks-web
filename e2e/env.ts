/** Where the app under test listens. */
export const APP_URL = `http://localhost:8080`

/** Where Radicale listens: `deno task radicale:up` locally, a service container in CI. */
export const RADICALE_URL = Deno.env.get("RADICALE_URL") ?? `http://localhost:5232`

/** The account on Radicale. Radicale in `infra/compose.dev.yml` accepts any user and password. */
export const CALDAV_USERNAME = `e2e`
export const CALDAV_PASSWORD = `e2e-not-a-real-password`

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
    OWNER_PASSWORD_HASH: `e2e-not-a-real-hash`,
    AUTH_PEPPER: `e2e-pepper-e2e-pepper-e2e-pepper`,
    SESSION_SECRET: `e2e-secret-e2e-secret-e2e-secret`,
  }
}
