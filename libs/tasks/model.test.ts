/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { isOpen, parseTask, priorityBand } from "./model.ts"
import { COMPLETED, ERRANDS, fixtureTask, LIST_HREF, RECURRING, task } from "./fixtures/tasksorg.ts"
import { PriorityBand, TaskStatus } from "./types.ts"

Deno.test("reads every field of a repeating Tasks.org task", () => {
  const read = fixtureTask(RECURRING)
  expect(read.uid).toBe(`100200320`)
  expect(read.title).toBe(`Stretch before breakfast`)
  expect(read.notes).toBe(`Ten minutes, no phone`)
  expect(read.priority).toBe(1)
  expect(read.tags).toEqual([`health`, `morning`])
  expect(read.repeatRule).toBe(`FREQ=DAILY;INTERVAL=1`)
  expect(read.sortOrder).toBe(783013311)
  expect(read.due).toEqual({
    kind: IcalDateKind.Zoned,
    date: `2026-10-08`,
    time: `07:00:00`,
    tzid: `Asia/Ho_Chi_Minh`,
  })
  expect(read.reminders).toEqual([{ trigger: `PT0S` }])
  expect(read.status).toBe(TaskStatus.NeedsAction)
})

Deno.test("keeps the href, etag, list and raw text it was given", () => {
  const result = parseTask({ href: `/a.ics`, etag: `"e7"`, listHref: LIST_HREF, ics: RECURRING })
  if (!result.success) throw new Error(result.error)
  expect(result.output.href).toBe(`/a.ics`)
  expect(result.output.etag).toBe(`"e7"`)
  expect(result.output.listHref).toBe(LIST_HREF)
  expect(result.output.ics).toBe(RECURRING)
})

Deno.test("a RELATED-TO with no RELTYPE makes the task a subtask", () => {
  expect(fixtureTask(ERRANDS[`100200301`]).parentUid).toBe(`100200300`)
})

Deno.test("a RELATED-TO of type CHILD or SIBLING does not name a parent", () => {
  const child = fixtureTask(task(`1`, `Parent`, [`RELATED-TO;RELTYPE=CHILD:2`]))
  const sibling = fixtureTask(task(`3`, `Next`, [`RELATED-TO;RELTYPE=SIBLING:2`]))
  expect(child.parentUid).toBeUndefined()
  expect(sibling.parentUid).toBeUndefined()
})

Deno.test("a task with no STATUS needs action, and a completed one is not open", () => {
  expect(fixtureTask(ERRANDS[`100200303`]).status).toBe(TaskStatus.NeedsAction)
  const done = fixtureTask(COMPLETED)
  expect(done.status).toBe(TaskStatus.Completed)
  expect(isOpen(done)).toBe(false)
  expect(isOpen(fixtureTask(ERRANDS[`100200303`]))).toBe(true)
})

Deno.test("a resource with no VTODO is a failure, not a throw", () => {
  const result = parseTask({
    href: `/x.ics`,
    etag: `"1"`,
    listHref: LIST_HREF,
    ics: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n`,
  })
  expect(result.success).toBe(false)
})

Deno.test("a task with no UID is a failure, not a throw", () => {
  const ics = task(`1`, `Nameless`).replace(`UID:1\r\n`, ``)
  const result = parseTask({ href: `/x.ics`, etag: `"1"`, listHref: LIST_HREF, ics })
  expect(result.success).toBe(false)
})

Deno.test("text that is not iCalendar is a failure, not a throw", () => {
  const result = parseTask({ href: `/x.ics`, etag: `"1"`, listHref: LIST_HREF, ics: `hello` })
  expect(result.success).toBe(false)
})

Deno.test("priorities 1 to 4 are high, 5 medium, 6 to 9 low and 0 none", () => {
  const bands = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(priorityBand)
  expect(bands).toEqual([
    PriorityBand.None,
    PriorityBand.High,
    PriorityBand.High,
    PriorityBand.High,
    PriorityBand.High,
    PriorityBand.Medium,
    PriorityBand.Low,
    PriorityBand.Low,
    PriorityBand.Low,
    PriorityBand.Low,
  ])
})
