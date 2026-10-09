/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { editTask } from "./edit.ts"
import {
  COMPLETED,
  CREATION,
  DUE_KINDS,
  ERRANDS,
  fixtureTask,
  LIST_HREF,
  RECURRING,
  STAMP_ONLY,
  task,
  vtodo,
} from "./fixtures/tasksorg.ts"
import { COMPLETE_FIXTURES } from "./fixtures/complete.ts"
import { TaskStatus } from "./types.ts"

const NOW = new Date(`2026-10-08T12:30:45.678Z`)
/** What `NOW` looks like in an iCalendar `DTSTAMP`. */
const STAMP = `20261008T123045Z`

const EVERY_FIXTURE: [string, string][] = [
  ...Object.entries(ERRANDS),
  ...Object.entries(CREATION),
  ...Object.entries(DUE_KINDS),
  [`stamp only`, STAMP_ONLY],
  [`recurring`, RECURRING],
  [`completed`, COMPLETED],
  ...COMPLETE_FIXTURES.map((f): [string, string] => [f.name, f.before]),
]

const lines = (text: string) => text.split(`\r\n`)

/** The lines that are in one text and not in the other, as a multiset. */
function difference(from: string[], other: string[]): string[] {
  const left = [...other]
  return from.filter((line) => {
    const at = left.indexOf(line)
    if (at < 0) return true
    left.splice(at, 1)
    return false
  })
}

function edited(ics: string, edit: Parameters<typeof editTask>[1]) {
  const result = editTask(fixtureTask(ics), edit, NOW)
  if (!result.success) throw new Error(result.error)
  return result.output
}

for (const [name, ics] of EVERY_FIXTURE) {
  Deno.test(`editing the title of ${name} changes only SUMMARY, DTSTAMP and LAST-MODIFIED`, () => {
    const { ics: after } = edited(ics, { title: `Renamed` })
    const removed = difference(lines(ics), lines(after))
    const added = difference(lines(after), lines(ics))
    const allowed = /^(SUMMARY|DTSTAMP|LAST-MODIFIED)[:;]/
    expect(removed.filter((line) => !allowed.test(line))).toEqual([])
    expect(added.filter((line) => !allowed.test(line))).toEqual([])
    expect(added).toContain(`SUMMARY:Renamed`)
    expect(added).toContain(`DTSTAMP:${STAMP}`)
    expect(added).toContain(`LAST-MODIFIED:${STAMP}`)
    expect(added.some((line) => line.startsWith(`SEQUENCE:`))).toBe(false)
  })
}

Deno.test(`a due date edit raises SEQUENCE by one each time it is saved`, () => {
  const due = (date: string) => ({ kind: IcalDateKind.Date, date }) as const
  const first = edited(task(`1`, `A`), { due: due(`2026-11-02`) })
  expect(lines(first.ics)).toContain(`SEQUENCE:1`)
  const second = editTask(first.task, { due: due(`2026-11-03`) }, NOW)
  if (!second.success) throw new Error(second.error)
  expect(lines(second.output.ics)).toContain(`SEQUENCE:2`)
})

Deno.test(`an edit keeps reminders and unknown X- properties byte for byte`, () => {
  const ics = vtodo([
    `DTSTAMP:20261001T080000Z`,
    `UID:9`,
    `SUMMARY:Keep`,
    `X-VENDOR-FLAG;X-PARAM=a\\,b:odd \; value`,
    `X-MOZ-LASTACK:20261001T080000Z`,
  ])
  const { ics: after } = edited(ics, { title: `Kept`, priority: 5, tags: [`a`] })
  for (
    const kept of [
      `X-VENDOR-FLAG;X-PARAM=a\\,b:odd \; value`,
      `X-MOZ-LASTACK:20261001T080000Z`,
      `BEGIN:VALARM`,
      `TRIGGER;RELATED=END:PT0S`,
      `ACTION:DISPLAY`,
      `DESCRIPTION:Default Tasks.org description`,
      `END:VALARM`,
    ]
  ) expect(lines(after)).toContain(kept)
})

Deno.test(`an edit of every editor field reads back on the returned task`, () => {
  const due = { kind: IcalDateKind.Floating, date: `2026-11-02`, time: `18:00:00` } as const
  const start = { kind: IcalDateKind.Floating, date: `2026-11-01`, time: `09:00:00` } as const
  const { task: read } = edited(task(`1`, `Old`), {
    title: `New`,
    notes: `Line one`,
    due,
    start,
    priority: 9,
    tags: [`home`, `urgent`],
    sortOrder: 55,
  })
  expect(read.title).toBe(`New`)
  expect(read.notes).toBe(`Line one`)
  expect(read.due).toEqual(due)
  expect(read.start).toEqual(start)
  expect(read.priority).toBe(9)
  expect(read.tags).toEqual([`home`, `urgent`])
  expect(read.sortOrder).toBe(55)
})

Deno.test(`clearing due, start, notes and tags removes their lines`, () => {
  const ics = task(`1`, `Full`, [
    `DESCRIPTION:Some notes`,
    `DUE;VALUE=DATE:20261009`,
    `DTSTART;VALUE=DATE:20261008`,
    `CATEGORIES:a,b`,
  ])
  const { ics: after, task: read } = edited(ics, { notes: ``, due: null, start: null, tags: [] })
  // The reminder keeps its own DESCRIPTION line; the task's is gone.
  expect(lines(after).filter((line) => line.startsWith(`DESCRIPTION:`))).toEqual([
    `DESCRIPTION:Default Tasks.org description`,
  ])
  expect(after).not.toMatch(/^(DUE|DTSTART|CATEGORIES)/m)
  expect([read.notes, read.due, read.start, read.tags]).toEqual([``, undefined, undefined, []])
})

Deno.test(`empty notes on a task without notes write no empty DESCRIPTION line`, () => {
  const { ics: after } = edited(task(`1`, `No notes`), { notes: `` })
  expect(lines(after)).not.toContain(`DESCRIPTION:`)
})

Deno.test(`an edit keeps the href, the etag and the identity of the task`, () => {
  const source = fixtureTask(task(`77`, `Same`))
  const result = editTask(source, { title: `Other` }, NOW)
  if (!result.success) throw new Error(result.error)
  const { task: read } = result.output
  expect([read.uid, read.href, read.etag, read.listHref]).toEqual([
    `77`,
    source.href,
    source.etag,
    LIST_HREF,
  ])
})

Deno.test(`choosing another list asks the caller to move the task and keeps its text`, () => {
  const result = editTask(fixtureTask(task(`1`, `Move me`)), { listHref: `/dav/tasks/work/` }, NOW)
  if (!result.success) throw new Error(result.error)
  expect(result.output.moveToList).toBe(`/dav/tasks/work/`)
  // The new resource keeps the file name; the old one is deleted only once it exists.
  expect(result.output.moveToHref).toBe(`/dav/tasks/work/x.ics`)
  expect(result.output.task.href).toBe(`/dav/tasks/work/x.ics`)
  expect(result.output.task.listHref).toBe(`/dav/tasks/work/`)
  expect(result.output.ics).toBe(task(`1`, `Move me`))
})

Deno.test(`choosing the list the task is already in does not ask for a move`, () => {
  const output = edited(task(`1`, `Stay`), { listHref: LIST_HREF, title: `Stay put` })
  expect([output.moveToList, output.moveToHref]).toEqual([undefined, undefined])
  expect(output.task.href).toBe(`${LIST_HREF}x.ics`)
})

Deno.test(`a zoned date with no time zone definition is refused and nothing is written`, () => {
  const source = fixtureTask(task(`1`, `Zoned`))
  const result = editTask(
    source,
    {
      due: { kind: IcalDateKind.Zoned, date: `2026-11-02`, time: `09:00:00`, tzid: `Europe/Paris` },
    },
    NOW,
  )
  expect(result.success).toBe(false)
  expect(result.output).toBeNull()
  expect(result.error).toEqual(expect.any(String))
  expect(source.ics).toBe(task(`1`, `Zoned`))
})

Deno.test(`an impossible priority is refused`, () => {
  const result = editTask(fixtureTask(task(`1`, `P`)), { priority: 12 }, NOW)
  expect(result.success).toBe(false)
})

Deno.test(`an edit of a completed task keeps it completed`, () => {
  const { task: read } = edited(COMPLETED, { title: `Returned` })
  expect(read.status).toBe(TaskStatus.Completed)
})
