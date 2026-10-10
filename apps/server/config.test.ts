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
