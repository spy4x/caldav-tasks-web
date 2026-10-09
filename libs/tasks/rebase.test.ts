/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { EditField, editTask, type TaskEdit } from "./edit.ts"
import { fixtureTask, task } from "./fixtures/tasksorg.ts"
import { keepMine, rebaseEdit, RebaseKind } from "./rebase.ts"
import type { Task } from "./types.ts"

const NOW = new Date(`2026-10-08T12:30:45.678Z`)
const LATER = new Date(`2026-10-08T13:00:00.000Z`)

const BASE = fixtureTask(task(`1`, `Original`, [
  `DESCRIPTION:Original notes`,
  `DUE;VALUE=DATE:20261009`,
  `CATEGORIES:a`,
  `X-VENDOR:keep me`,
]))

/** The copy the server holds after someone else saved `change` on top of BASE. */
function elsewhere(change: TaskEdit): Task {
  const result = editTask(BASE, change, NOW)
  if (!result.success) throw new Error(result.error)
  return { ...result.output.task, etag: `"2"` }
}

function rebase(mine: TaskEdit, theirs: Task) {
  const result = rebaseEdit(BASE, mine, theirs, LATER)
  if (!result.success) throw new Error(result.error)
  return result.output
}

Deno.test(`an edit of other fields is applied on top of the fresh copy`, () => {
  const theirs = elsewhere({ notes: `Changed on the phone` })
  const output = rebase({ title: `Renamed here` }, theirs)
  if (output.kind !== RebaseKind.Applied) throw new Error(`expected an applied rebase`)
  expect(output.task.title).toBe(`Renamed here`)
  expect(output.task.notes).toBe(`Changed on the phone`)
  // It builds on the fresh text and keeps the etag it came with.
  expect(output.task.etag).toBe(`"2"`)
  expect(output.ics).toContain(`SEQUENCE:2`)
  expect(output.ics).toContain(`X-VENDOR:keep me`)
})

Deno.test(`an edit of the same field to a different value is reported as a collision`, () => {
  const theirs = elsewhere({ title: `Their title` })
  const output = rebase({ title: `My title` }, theirs)
  expect(output).toEqual({ kind: RebaseKind.Collision, fields: [EditField.Title] })
})

Deno.test(`every colliding field is reported, and fields that did not collide are not`, () => {
  const theirs = elsewhere({ title: `Their title`, priority: 1, notes: `Their notes` })
  const output = rebase({ title: `Mine`, priority: 9, tags: [`b`] }, theirs)
  expect(output).toEqual({
    kind: RebaseKind.Collision,
    fields: [EditField.Title, EditField.Priority],
  })
})

Deno.test(`both sides setting the same value is not a collision`, () => {
  const theirs = elsewhere({ title: `Same` })
  const output = rebase({ title: `Same`, priority: 5 }, theirs)
  expect(output.kind).toBe(RebaseKind.Applied)
})

Deno.test(`a field the edit leaves as it was is not a collision when the server changed it`, () => {
  const theirs = elsewhere({ title: `Their title` })
  const output = rebase({ title: BASE.title, priority: 5 }, theirs)
  if (output.kind !== RebaseKind.Applied) throw new Error(`expected an applied rebase`)
  expect(output.task.title).toBe(`Their title`)
  expect(output.task.priority).toBe(5)
})

Deno.test(`dates collide on their value, not on the object that holds it`, () => {
  const theirs = elsewhere({ due: { kind: IcalDateKind.Date, date: `2026-12-24` } })
  expect(rebase({ due: { kind: IcalDateKind.Date, date: `2026-12-24` } }, theirs).kind).toBe(
    RebaseKind.Applied,
  )
  expect(rebase({ due: { kind: IcalDateKind.Date, date: `2026-12-25` } }, theirs)).toEqual({
    kind: RebaseKind.Collision,
    fields: [EditField.Due],
  })
})

Deno.test(`clearing a field the server changed is a collision`, () => {
  const theirs = elsewhere({ due: { kind: IcalDateKind.Date, date: `2026-12-24` } })
  expect(rebase({ due: null }, theirs)).toEqual({
    kind: RebaseKind.Collision,
    fields: [EditField.Due],
  })
})

Deno.test(`"Keep mine" with a form that sends every field keeps what the server changed elsewhere`, () => {
  const theirs = elsewhere({ title: `Their title`, notes: `Phone notes` })
  const wholeForm: TaskEdit = {
    title: `My title`,
    notes: BASE.notes,
    due: BASE.due,
    start: BASE.start ?? null,
    priority: BASE.priority,
    tags: BASE.tags,
    listHref: BASE.listHref,
  }
  const kept = keepMine(BASE, wholeForm, theirs, LATER)
  if (!kept.success) throw new Error(kept.error)
  expect(kept.output.task.title).toBe(`My title`)
  expect(kept.output.task.notes).toBe(`Phone notes`)
})

Deno.test(`a refused edit on the fresh copy is a failure with a message`, () => {
  const result = rebaseEdit(BASE, { priority: 12 }, elsewhere({ notes: `n` }), LATER)
  expect(result.success).toBe(false)
  expect(result.error).toEqual(expect.any(String))
})
