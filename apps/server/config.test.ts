/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { createEnvReader } from "@spy4x/server/config"
import { ConfigError, describeConfigError, readConfig } from "./config.ts"
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
