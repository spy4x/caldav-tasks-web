/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import { PUSH_VARIABLES } from "./config.ts"
import { TEST_CONFIG } from "./test-config.ts"

const MAIN = fromFileUrl(new URL("./+main.ts", import.meta.url))

/** Runs the server entry with the given variables set; a blank value counts as unset. */
async function runMain(env: Record<string, string>) {
  const blank = Object.fromEntries(
    [...Object.keys(TEST_CONFIG), ...PUSH_VARIABLES].map((name) => [name, ""]),
  )
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "--allow-env", "--allow-net", "--allow-read", MAIN],
    env: { ...blank, ...env },
    stdout: "piped",
    stderr: "piped",
  }).output()
  return { code: output.code, stderr: new TextDecoder().decode(output.stderr) }
}

Deno.test("exits 1 and names each missing variable when none is set", async () => {
  const { code, stderr } = await runMain({})
  expect(code).toBe(1)
  for (const name of Object.keys(TEST_CONFIG)) expect(stderr).toContain(name)
})

Deno.test("exits 1 and names only CALDAV_PASSWORD when it alone is missing", async () => {
  const { code, stderr } = await runMain({ ...TEST_CONFIG, CALDAV_PASSWORD: "" })
  expect(code).toBe(1)
  expect(stderr).toContain("CALDAV_PASSWORD")
  expect(stderr).not.toContain("CALDAV_USERNAME")
})

Deno.test("loads without exiting when every variable is set", async () => {
  const { code, stderr } = await runMain({ ...TEST_CONFIG })
  expect(stderr).not.toContain("Cannot start")
  expect(code).toBe(0)
})

Deno.test("exits 1 and names the missing push variables when only some are set", async () => {
  const { code, stderr } = await runMain({
    ...TEST_CONFIG,
    VAPID_SUBJECT: "mailto:owner@example.com",
    DATA_DIR: "/data-of-the-test",
  })
  expect(code).toBe(1)
  expect(stderr).toContain("Cannot start")
  for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "REMINDER_TIME_ZONE"]) {
    expect(stderr).toContain(name)
  }
  expect(stderr).not.toContain("VAPID_SUBJECT")
  expect(stderr).not.toContain("owner@example.com")
  expect(stderr).not.toContain("data-of-the-test")
})
