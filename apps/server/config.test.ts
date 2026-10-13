/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { createEnvReader } from "@spy4x/server/config"
import {
  ConfigError,
  describeConfigError,
  PUSH_VARIABLES,
  readConfig,
  readPushConfig,
} from "./config.ts"
import { TEST_CONFIG } from "./test-config.ts"

const VARIABLES = Object.keys(TEST_CONFIG)

function without(...names: string[]): Record<string, string> {
  const env: Record<string, string> = { ...TEST_CONFIG }
  for (const name of names) delete env[name]
  return env
}

Deno.test("accepts a complete environment", () => {
  expect(readConfig(createEnvReader({ ...TEST_CONFIG }))).toEqual(TEST_CONFIG)
})

Deno.test("names every missing variable at once", () => {
  const error = (() => {
    try {
      readConfig(createEnvReader({}))
    } catch (error) {
      return error
    }
  })()
  expect(error).toBeInstanceOf(ConfigError)
  const message = describeConfigError(error as ConfigError)
  for (const name of VARIABLES) expect(message).toContain(name)
})

Deno.test("names only the variable that is missing", () => {
  for (const name of VARIABLES) {
    const reader = createEnvReader(without(name))
    try {
      readConfig(reader)
      throw new Error(`${name} was not required`)
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).variables).toEqual([name])
    }
  }
})

Deno.test("treats a blank variable as missing", () => {
  expect(() => readConfig(createEnvReader({ ...TEST_CONFIG, CALDAV_PASSWORD: "" }))).toThrow(
    ConfigError,
  )
})

Deno.test("refuses a pepper or session secret shorter than 32 characters", () => {
  for (const name of ["AUTH_PEPPER", "SESSION_SECRET"]) {
    expect(() => readConfig(createEnvReader({ ...TEST_CONFIG, [name]: "short" }))).toThrow(
      ConfigError,
    )
  }
})

Deno.test("refuses a PUBLIC_URL or CALDAV_URL that is not a URL", () => {
  for (const name of ["PUBLIC_URL", "CALDAV_URL"]) {
    expect(() => readConfig(createEnvReader({ ...TEST_CONFIG, [name]: "not a url" }))).toThrow(
      ConfigError,
    )
  }
})

/** The `ConfigError` the seven variables with `changes` applied are refused with. */
function configError(changes: Record<string, string>): ConfigError {
  try {
    readConfig(createEnvReader({ ...TEST_CONFIG, ...changes }))
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError)
    return error as ConfigError
  }
  throw new Error(`the configuration was accepted with ${Object.keys(changes).join(", ")} changed`)
}

Deno.test("refuses an address that is not http or https, or that carries a username or password", () => {
  for (const name of ["PUBLIC_URL", "CALDAV_URL"]) {
    for (
      const value of [
        "ftp://tasks.example.com",
        "mailto:owner@example.com",
        "https://someone@tasks.example.com",
        "https://someone:hunter2-hunter2@tasks.example.com",
      ]
    ) {
      const error = configError({ [name]: value })
      expect([name, value, error.variables]).toEqual([name, value, [name]])
      expect(describeConfigError(error)).toContain(`${name} must be an http:// or https:// address`)
      expect(describeConfigError(error)).not.toContain("hunter2")
    }
  }
})

Deno.test("refuses a PUBLIC_URL on plain http, except on the machine itself", () => {
  for (const value of ["http://tasks.example.com", "http://192.168.1.10:8080", "http://0.0.0.0"]) {
    const error = configError({ PUBLIC_URL: value })
    expect([value, error.variables]).toEqual([value, ["PUBLIC_URL"]])
    expect(describeConfigError(error)).toContain("PUBLIC_URL must start with https://")
  }
  for (
    const value of [
      "https://tasks.example.com",
      "http://localhost:5173",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ]
  ) {
    const env = { ...TEST_CONFIG, PUBLIC_URL: value }
    expect(readConfig(createEnvReader(env))).toEqual(env)
  }
})

Deno.test("accepts a CALDAV_URL on plain http, on any host", () => {
  for (
    const value of ["http://radicale:5232", "http://192.168.1.10/dav", "https://dav.example.com"]
  ) {
    const env = { ...TEST_CONFIG, CALDAV_URL: value }
    expect(readConfig(createEnvReader(env))).toEqual(env)
  }
})

Deno.test("refuses an owner password hash that is cut short or is still the placeholder", () => {
  const parts = TEST_CONFIG.OWNER_PASSWORD_HASH.split("$")
  const damaged = [
    // What `--env-file` leaves of an unquoted hash, and each shorter or longer cut.
    ...[1, 2, 3].map((kept) => parts.slice(0, kept).join("$")),
    "<output of deno task password:hash>",
    `'${TEST_CONFIG.OWNER_PASSWORD_HASH}'`,
  ]
  for (const value of damaged) {
    const error = configError({ OWNER_PASSWORD_HASH: value })
    expect([value, error.variables]).toEqual([value, ["OWNER_PASSWORD_HASH"]])
    const message = describeConfigError(error)
    expect(message).toContain("OWNER_PASSWORD_HASH must be the whole output of")
    expect(message).toContain("single quotes")
    expect(message).not.toContain(parts[2])
  }
})

Deno.test("names every badly shaped variable at once", () => {
  const error = configError({
    PUBLIC_URL: "http://tasks.example.com",
    CALDAV_URL: "ftp://dav.example.com",
    OWNER_PASSWORD_HASH: "pbkdf2-sha256",
  })
  expect(error.variables).toEqual(["CALDAV_URL", "OWNER_PASSWORD_HASH", "PUBLIC_URL"])
})

/** A complete push group. The keys are placeholders: this reader checks that they are set only. */
const PUSH = {
  VAPID_PUBLIC_KEY: "test-vapid-public-key",
  VAPID_PRIVATE_KEY: "test-vapid-private-key",
  VAPID_SUBJECT: "mailto:owner@example.com",
  DATA_DIR: "/data",
  REMINDER_TIME_ZONE: "Europe/Berlin",
}

function pushError(env: Record<string, string>): ConfigError {
  try {
    readPushConfig(createEnvReader(env))
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError)
    return error as ConfigError
  }
  throw new Error("the push group was accepted")
}

Deno.test("push is off when none of its variables is set, or all are blank or white space", () => {
  expect(readPushConfig(createEnvReader({ ...TEST_CONFIG }))).toBe(null)
  for (const empty of ["", " ", "\t \n"]) {
    const blank = Object.fromEntries(PUSH_VARIABLES.map((name) => [name, empty]))
    expect(readPushConfig(createEnvReader({ ...TEST_CONFIG, ...blank }))).toBe(null)
  }
})

Deno.test("push is on with its five variables set", () => {
  expect(Object.keys(PUSH)).toEqual([...PUSH_VARIABLES])
  expect(readPushConfig(createEnvReader({ ...TEST_CONFIG, ...PUSH }))).toEqual(PUSH)
})

Deno.test("a partial push group is refused, naming each missing variable and no value", () => {
  for (const present of PUSH_VARIABLES) {
    const error = pushError({ [present]: PUSH[present] })
    expect(error.variables).toEqual(PUSH_VARIABLES.filter((name) => name !== present).sort())
    expect(describeConfigError(error)).not.toContain(PUSH[present])
  }
  for (const missing of PUSH_VARIABLES) {
    const env: Record<string, string> = { ...PUSH, [missing]: "" }
    const error = pushError(env)
    expect(error.variables).toEqual([missing])
    const message = describeConfigError(error)
    for (const value of Object.values(env)) if (value) expect(message).not.toContain(value)
  }
})

Deno.test("refuses a VAPID subject that is not a mailto: or https: address", () => {
  for (const subject of ["owner@example.com", "http://example.com", "mailto:", "https://"]) {
    const error = pushError({ ...PUSH, VAPID_SUBJECT: subject })
    expect([subject, error.variables]).toEqual([subject, ["VAPID_SUBJECT"]])
  }
  expect(readPushConfig(createEnvReader({ ...PUSH, VAPID_SUBJECT: "https://example.com/me" })))
    .not.toBe(null)
})

Deno.test("refuses a reminder time zone that is not an IANA zone", () => {
  const error = pushError({ ...PUSH, REMINDER_TIME_ZONE: "Berlin" })
  expect(error.variables).toEqual(["REMINDER_TIME_ZONE"])
  expect(describeConfigError(error)).toContain("REMINDER_TIME_ZONE must be an IANA time zone")
})
