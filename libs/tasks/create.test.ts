/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { createTask } from "./create.ts"
import { ERRANDS, fixtureTask, LIST_HREF } from "./fixtures/tasksorg.ts"
import { parseTask } from "./model.ts"
import { TaskStatus } from "./types.ts"

const NOW = new Date(`2026-10-08T12:30:45.678Z`)

function created(
  fields: Parameters<typeof createTask>[0],
  context: Partial<Parameters<typeof createTask>[1]> = {},
) {
  const result = createTask(fields, { uid: `new-1`, now: NOW, listHref: LIST_HREF, ...context })
  if (!result.success) throw new Error(result.error)
  return result.output
}

function readBack(output: ReturnType<typeof created>) {
  const result = parseTask({
    href: output.href,
    etag: `"1"`,
    listHref: output.listHref,
    ics: output.ics,
  })
  if (!result.success) throw new Error(result.error)
  return result.output
}

Deno.test(`a new task reads back with the fields it was created with`, () => {
  const due = { kind: IcalDateKind.Date, date: `2026-11-02` } as const
  const start = { kind: IcalDateKind.Date, date: `2026-11-01` } as const
  const read = readBack(created({
    title: `Buy milk`,
    notes: `Two litres`,
    due,
    start,
    priority: 1,
    tags: [`shop`, `home`],
  }))
  expect(read.uid).toBe(`new-1`)
  expect(read.title).toBe(`Buy milk`)
  expect(read.notes).toBe(`Two litres`)
  expect(read.due).toEqual(due)
  expect(read.start).toEqual(start)
  expect(read.priority).toBe(1)
  expect(read.tags).toEqual([`shop`, `home`])
  expect(read.status).toBe(TaskStatus.NeedsAction)
  expect(read.parentUid).toBeUndefined()
})

Deno.test(`a new task is stamped with the caller's clock and this app's PRODID`, () => {
  const { ics } = created({ title: `Stamped` })
  expect(ics).toContain(`PRODID:-//spy4x//caldav-tasks-web//EN`)
  expect(ics).toContain(`DTSTAMP:20261008T123045Z`)
  expect(ics).toContain(`CREATED:20261008T123045Z`)
})

Deno.test(`a new subtask carries its parent's UID in RELATED-TO and goes in the parent's list`, () => {
  const parent = fixtureTask(ERRANDS[`100200300`])
  const output = created({ title: `Sub` }, { parent, listHref: `/dav/tasks/other/` })
  expect(output.ics).toMatch(/^RELATED-TO;RELTYPE=PARENT:100200300\r$/m)
  expect(output.listHref).toBe(parent.listHref)
  expect(output.href.startsWith(parent.listHref)).toBe(true)
  expect(readBack(output).parentUid).toBe(`100200300`)
})

Deno.test(`a task that is not a subtask goes in the list it was given`, () => {
  const output = created({ title: `Top` }, { listHref: `/dav/tasks/work` })
  expect(output.listHref).toBe(`/dav/tasks/work`)
  expect(output.href).toBe(`/dav/tasks/work/new-1.ics`)
  expect(output.ics).not.toContain(`RELATED-TO`)
})

Deno.test(`a zoned due date is refused because a new text has no time zone definition`, () => {
  const result = createTask(
    {
      title: `Zoned`,
      due: { kind: IcalDateKind.Zoned, date: `2026-11-02`, time: `09:00:00`, tzid: `Europe/Paris` },
    },
    { uid: `new-2`, now: NOW, listHref: LIST_HREF },
  )
  expect(result.success).toBe(false)
  expect(result.output).toBeNull()
})
