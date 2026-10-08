import type { Config } from "./config.ts"

/** A valid configuration for tests. None of these values is a real credential. */
export const TEST_CONFIG: Config = {
  PUBLIC_URL: "http://localhost:8080",
  CALDAV_URL: "http://localhost:5232",
  CALDAV_USERNAME: "test-user",
  CALDAV_PASSWORD: "test-caldav-password",
  // The hash of TEST_OWNER_PASSWORD under AUTH_PEPPER below, at the hasher's lowest iteration count
  // so tests stay quick.
  OWNER_PASSWORD_HASH:
    "pbkdf2-sha256$100000$aa6788cd86b5d767855d1d15a713c2b0$b1adf11ada63ea304fedcb6d75780806254bb0e8a8e2fd45dec474eb267e8cc0",
  AUTH_PEPPER: "test-pepper-test-pepper-test-pepper",
  SESSION_SECRET: "test-secret-test-secret-test-secret",
}

/** The owner password whose hash TEST_CONFIG holds. */
export const TEST_OWNER_PASSWORD = "test-owner-password"
