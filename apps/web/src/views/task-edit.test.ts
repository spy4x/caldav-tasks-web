/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { fixtureTask, LIST_HREF, vtodo } from "@tasks/fixtures/tasksorg.ts"
import type { TaskDraft } from "@ui/task-editor-screen.tsx"
import { draftToEdit } from "./task-edit.ts"

const task = fixtureTask(vtodo([
  `UID:1`,
  `SUMMARY:Call Ana`,
  `DUE:20261012T090000`,
  `PRIORITY:5`,
  `CATEGORIES:home`,
]))

function draft(over: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: task.title,
    notes: task.notes,
    due: task.due ?? null,
    start: task.start ?? null,
    priority: task.priority,
    listHref: task.listHref,
    tags: task.tags,
    ...over,
  }
}

Deno.test(`a form nobody changed produces an empty edit, so a floating time stays floating`, () => {
  expect(task.due?.kind).toBe(IcalDateKind.Floating)
  expect(draftToEdit(task, draft())).toEqual({})
})

Deno.test(`only the fields the person changed go into the edit`, () => {
  const edit = draftToEdit(
    task,
    draft({
      title: `Call Ana back`,
      tags: [`home`, `phone`],
      due: null,
      listHref: `${LIST_HREF}x/`,
    }),
  )
  expect(edit).toEqual({
    title: `Call Ana back`,
    tags: [`home`, `phone`],
    due: null,
    listHref: `${LIST_HREF}x/`,
  })
})

Deno.test(`a changed time of day is sent as the new value`, () => {
  const due = { kind: IcalDateKind.Floating, date: `2026-10-12`, time: `10:30:00` }
  expect(draftToEdit(task, draft({ due }))).toEqual({ due })
})
