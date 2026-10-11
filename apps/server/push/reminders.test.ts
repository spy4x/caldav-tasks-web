/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CalDavErrorCode } from "@spy4x/caldav"
import { COMPLETED, DUE_KINDS, task } from "@tasks/fixtures/tasksorg.ts"
import { DAV, EVENTS, FakeCalDav, TASKS } from "../caldav/fake-caldav.test.ts"
import { createReminders, OWNER } from "./reminders.ts"
import { FakeSender, memoryStore } from "./testing.ts"

/** The SHA-256 of `text` in hex: what the library makes a reminder's tag from its key. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * The runner over a fake CalDAV account that holds `tasks`, a fake sender and a clock the test
 * moves. The first tick only notes the time, so each test ticks once before the reminder is due.
 */
async function reminders(tasks: Record<string, string>, startAt: string) {
  const dav = new FakeCalDav()
  dav.objects = new Map(
    Object.entries(tasks).map(([name, data]) => [`${DAV}${name}`, { etag: `"1"`, data }]),
  )
  const sender = new FakeSender()
  const lines: string[] = []
  let now = Date.parse(startAt)
  const runner = createReminders({
    client: dav,
    sender,
    state: memoryStore().state("reminders"),
    zone: "Europe/Berlin",
    log: (line) => lines.push(line),
    clock: { now: () => now },
    // No timer ever fires: the test runs each tick itself.
    timers: { set: () => 0, clear: () => {} },
  })
  await runner.tick()
  return {
    dav,
    sender,
    lines,
    /** Moves the clock to `at` and runs one tick. */
    tickAt: async (at: string) => {
      now = Date.parse(at)
      await runner.tick()
    },
  }
}

Deno.test("pushes a due reminder once, titled with the task and opening its editor", async () => {
  const { sender, tickAt, lines } = await reminders(
    { [`${TASKS}utc.ics`]: DUE_KINDS.utc },
    "2026-10-08T23:29:30Z",
  )
  expect(sender.sent).toEqual([])
  await tickAt("2026-10-08T23:30:30Z")
  expect(sender.sent).toEqual([{
    userId: OWNER,
    message: {
      title: "Due at a UTC time",
      body: null,
      url: "/tasks/100200312",
      tag: await sha256("100200312|2026-10-08T23:30:00.000Z"),
    },
  }])
  await tickAt("2026-10-08T23:31:30Z")
  expect(sender.sent.length).toBe(1)
  expect(lines).toEqual([])
})

Deno.test("reminds for a task due on a date at nine in the morning of the configured zone", async () => {
  const { sender, tickAt } = await reminders(
    { [`${TASKS}date.ics`]: DUE_KINDS.date },
    "2026-10-07T21:59:30Z",
  )
  // Midnight in Berlin (22:00 UTC) passes with nothing sent.
  await tickAt("2026-10-07T22:00:30Z")
  await tickAt("2026-10-08T06:59:30Z")
  expect(sender.sent).toEqual([])
  // 09:00 in Berlin is 07:00 UTC on 8 October.
  await tickAt("2026-10-08T07:00:30Z")
  expect(sender.sent.map((push) => push.message.title)).toEqual(["Due as a date"])
})

Deno.test("reads only open tasks in lists that can hold tasks, and never writes", async () => {
  const { dav, sender, tickAt } = await reminders(
    {
      [`${TASKS}done.ics`]: COMPLETED,
      [`${EVENTS}stray.ics`]: task("900", "In the events calendar", ["DUE:20261007T100000Z"]),
    },
    "2026-10-07T09:59:30Z",
  )
  await tickAt("2026-10-07T10:00:30Z")
  expect(sender.sent).toEqual([])
  const methods = new Set(dav.calls.map(([method]) => method))
  expect([...methods].sort()).toEqual(["discover", "listCalendars", "listObjects"])
  expect(dav.calls.filter(([method]) => method === "listObjects")).toEqual([
    ["listObjects", `${DAV}${TASKS}`, { component: "VTODO", includeCompleted: false }],
    ["listObjects", `${DAV}${TASKS}`, { component: "VTODO", includeCompleted: false }],
  ])
})

Deno.test("opens the app, not the task, when the task's UID is too long for a push", async () => {
  const uid = "u".repeat(3500)
  const { sender, tickAt } = await reminders(
    { [`${TASKS}long.ics`]: task(uid, "Long UID", ["DUE:20261007T100000Z"]) },
    "2026-10-07T09:59:30Z",
  )
  await tickAt("2026-10-07T10:00:30Z")
  expect(sender.sent.map((push) => [push.message.title, push.message.url])).toEqual([
    ["Long UID", "/"],
  ])
})

Deno.test("logs a CalDAV failure as one line with no task text, and sends when it recovers", async () => {
  const { dav, sender, lines, tickAt } = await reminders(
    { [`${TASKS}utc.ics`]: DUE_KINDS.utc },
    "2026-10-08T23:29:30Z",
  )
  dav.failWith = { code: CalDavErrorCode.Unauthorized, message: "Due at a UTC time leaked" }
  await tickAt("2026-10-08T23:30:30Z")
  expect(sender.sent).toEqual([])
  expect(lines).toEqual(["reminders: list-tasks failed: listObjects failed: Unauthorized"])
  dav.failWith = null
  await tickAt("2026-10-08T23:31:30Z")
  expect(sender.sent.map((push) => push.message.title)).toEqual(["Due at a UTC time"])
})

Deno.test("a list that cannot be read is left out and logged as a count, and the other lists still remind", async () => {
  const broken = `${DAV}/test-user/secret-list/`
  const { dav, sender, lines, tickAt } = await reminders(
    { [`${TASKS}utc.ics`]: DUE_KINDS.utc },
    "2026-10-08T23:29:30Z",
  )
  dav.calendars.unshift({ url: broken, displayName: "Secret list", components: ["VTODO"] })
  dav.failLists.set(broken, { code: CalDavErrorCode.Forbidden, message: "Secret list leaked" })
  await tickAt("2026-10-08T23:30:30Z")
  expect(sender.sent.map((push) => push.message.title)).toEqual(["Due at a UTC time"])
  expect(lines).toEqual(["reminders: 1 of 2 task lists could not be read: Forbidden"])
})

Deno.test("a list that times out once delays the other lists' reminders by a tick and loses none", async () => {
  const slow = `${DAV}/test-user/slow-list/`
  const { dav, sender, lines, tickAt } = await reminders(
    { [`${TASKS}utc.ics`]: DUE_KINDS.utc },
    "2026-10-08T23:29:30Z",
  )
  dav.calendars.unshift({ url: slow, displayName: "Slow list", components: ["VTODO"] })
  dav.failLists.set(slow, { code: CalDavErrorCode.Timeout, message: "Slow list leaked" })
  await tickAt("2026-10-08T23:30:30Z")
  expect(sender.sent).toEqual([])
  expect(lines).toEqual(["reminders: list-tasks failed: listObjects failed: Timeout"])
  dav.failLists.delete(slow)
  await tickAt("2026-10-08T23:31:30Z")
  expect(sender.sent.map((push) => push.message.title)).toEqual(["Due at a UTC time"])
})

Deno.test("logs a push that every device refused as a count and a status only", async () => {
  const { sender, lines, tickAt } = await reminders(
    { [`${TASKS}utc.ics`]: DUE_KINDS.utc },
    "2026-10-08T23:29:30Z",
  )
  sender.result = {
    success: false,
    output: "",
    error: "HTTP 403",
    deliveries: [{
      endpoint: "https://8.8.8.8/push/device-1",
      status: "failed",
      httpStatus: 403,
      error: "HTTP 403",
      deleted: false,
    }],
  }
  await tickAt("2026-10-08T23:30:30Z")
  await tickAt("2026-10-08T23:31:30Z")
  expect(sender.sent.length).toBe(1)
  expect(lines.length).toBe(2)
  expect(lines).toContain("reminders: 1 of 1 devices did not get a reminder: HTTP 403 (1)")
  expect(lines.join("\n")).not.toContain("8.8.8.8")
  expect(lines.join("\n")).not.toContain("Due at a UTC time")
})
