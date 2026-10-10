/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import { generateVapidKeyPair } from "@spy4x/integrations/push"
import { vapidEnvLines } from "../../infra/scripts/vapid-keys-create.ts"
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

/**
 * Starts the entry with the whole push group set: throwaway keys, `dataDir` as the data folder and
 * a CalDAV address nothing listens on. With reminders running the process never ends by itself, so
 * it is stopped at the first line the reminder runner logs, or after 30 seconds.
 *
 * @param mayWrite Whether the process is allowed to write to `dataDir`.
 */
async function runWithPush(dataDir: string, mayWrite = true) {
  const keys = Object.fromEntries(
    vapidEnvLines(await generateVapidKeyPair(), "mailto:owner@example.com")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  )
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-prompt",
      "--allow-env",
      "--allow-net",
      "--allow-read",
      ...(mayWrite ? [`--allow-write=${dataDir}`] : []),
      MAIN,
    ],
    env: {
      ...TEST_CONFIG,
      ...keys,
      CALDAV_URL: "http://127.0.0.1:1",
      DATA_DIR: dataDir,
      REMINDER_TIME_ZONE: "UTC",
    },
    stdout: "null",
    stderr: "piped",
  }).spawn()
  const deadline = setTimeout(() => child.kill("SIGKILL"), 30_000)
  let stderr = ""
  let stopped = false
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr += chunk
    if (!stopped && /reminders: .*\n/.test(stderr)) {
      stopped = true
      child.kill("SIGTERM")
    }
  }
  const { code } = await child.status
  clearTimeout(deadline)
  // `deno run` itself warns that the entry is meant for `deno serve`.
  const lines = stderr.split("\n").filter((line) => line && !line.startsWith("warning: "))
  return { code, stderr, lines }
}

Deno.test("starts the reminder runner, which reads the tasks at once, when the push group is set", async () => {
  const dataDir = await Deno.makeTempDir()
  try {
    const { stderr } = await runWithPush(dataDir)
    expect(stderr).toContain("reminders: list-tasks failed: discover failed: Network")
    expect(stderr).not.toContain("notifications are off")
  } finally {
    await Deno.remove(dataDir, { recursive: true })
  }
})

Deno.test("starts with notifications off and one line when push.json is damaged", async () => {
  const dataDir = await Deno.makeTempDir()
  const file = `${dataDir}/push.json`
  await Deno.writeTextFile(file, "{ not json")
  try {
    const { code, lines } = await runWithPush(dataDir)
    expect(lines).toEqual([
      "push: notifications are off: push.json cannot be used (corrupt); it was left as it is",
    ])
    expect(code).toBe(0)
    expect(await Deno.readTextFile(file)).toBe("{ not json")
  } finally {
    await Deno.remove(dataDir, { recursive: true })
  }
})

Deno.test("starts with notifications off and one line when the data folder cannot be written", async () => {
  const dataDir = await Deno.makeTempDir()
  try {
    const { code, lines } = await runWithPush(dataDir, false)
    expect(lines).toEqual([
      "push: notifications are off: DATA_DIR cannot be read and written (NotCapable)",
    ])
    expect(code).toBe(0)
  } finally {
    await Deno.remove(dataDir, { recursive: true })
  }
})
