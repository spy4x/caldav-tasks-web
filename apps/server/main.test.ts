/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { TEST_CONFIG } from "./test-config.ts"

const MAIN = new URL("./+main.ts", import.meta.url).pathname

/** Runs the server entry with the given variables set; a blank value counts as unset. */
async function runMain(env: Record<string, string>) {
  const blank = Object.fromEntries(Object.keys(TEST_CONFIG).map((name) => [name, ""]))
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
