import type { Config } from "./config.ts"

/** A valid configuration for tests. None of these values is a real credential. */
export const TEST_CONFIG: Config = {
  PUBLIC_URL: "http://localhost:8080",
  CALDAV_URL: "http://localhost:5232",
  CALDAV_USERNAME: "test-user",
  CALDAV_PASSWORD: "test-caldav-password",
  OWNER_PASSWORD_HASH: "test-hash",
  AUTH_PEPPER: "test-pepper-test-pepper-test-pepper",
  SESSION_SECRET: "test-secret-test-secret-test-secret",
}
