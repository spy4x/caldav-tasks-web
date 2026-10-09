/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { IcalDateKind } from "@spy4x/time/ical"
import { type AlarmInput, AlarmRelated, AlarmTriggerKind } from "@spy4x/time/ical-tasks"
import type { Task } from "@spy4x/time/ical-tasks-model"
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
    repeatRule: task.repeatRule ?? null,
    reminders: task.reminders.map((item) => ({ trigger: item.alarm })),
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

const repeating = fixtureTask(vtodo([
  `UID:2`,
  `SUMMARY:Water the ferns`,
  `DUE:20261012T090000`,
  `RRULE:FREQ=WEEKLY;INTERVAL=1`,
]))

Deno.test(`a repeat rule and reminders the person left alone are left out of the edit`, () => {
  const same = {
    title: repeating.title,
    notes: repeating.notes,
    due: repeating.due ?? null,
    start: null,
    priority: repeating.priority,
    listHref: repeating.listHref,
    tags: repeating.tags,
    repeatRule: repeating.repeatRule ?? null,
    reminders: repeating.reminders.map((item) => ({ trigger: item.alarm })),
  }
  expect(repeating.reminders).toHaveLength(1)
  expect(draftToEdit(repeating, same)).toEqual({})
})

Deno.test(`a changed or cleared repeat rule goes into the edit; null clears it`, () => {
  const rule = `FREQ=DAILY;INTERVAL=3`
  expect(draftToEdit(task, draft({ repeatRule: rule }))).toEqual({ repeatRule: rule })
  expect(draftToEdit(repeating, { ...base(repeating), repeatRule: null })).toEqual({
    repeatRule: null,
  })
})

Deno.test(`added, removed or cleared reminders go into the edit as the whole list`, () => {
  const added: AlarmInput[] = [
    ...repeating.reminders.map((item) => ({ trigger: item.alarm })),
    {
      trigger: { kind: AlarmTriggerKind.Relative, duration: `-PT1H`, related: AlarmRelated.End },
    },
  ]
  expect(draftToEdit(repeating, { ...base(repeating), reminders: added })).toEqual({
    reminders: added,
  })
  expect(draftToEdit(repeating, { ...base(repeating), reminders: [] })).toEqual({ reminders: [] })
})

/** The form for `from` with nothing changed. */
function base(from: Task): TaskDraft {
  return {
    title: from.title,
    notes: from.notes,
    due: from.due ?? null,
    start: from.start ?? null,
    priority: from.priority,
    listHref: from.listHref,
    tags: from.tags,
    repeatRule: from.repeatRule ?? null,
    reminders: from.reminders.map((item) => ({ trigger: item.alarm })),
  }
}
