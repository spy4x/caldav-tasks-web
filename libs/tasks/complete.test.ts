/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  COMPLETE_IN_TASKS_ORG,
  CompleteErrorCode,
  CompleteKind,
  completeTask,
  reopenTask,
} from "./complete.ts"
import { COMPLETE_FIXTURES, COMPLETE_NOW } from "./fixtures/complete.ts"
import { COMPLETED, DUE_KINDS, fixtureTask, RECURRING, task, vtodo } from "./fixtures/tasksorg.ts"
import { TaskStatus } from "./types.ts"

for (const fixture of COMPLETE_FIXTURES) {
  Deno.test(`completing ${fixture.name} writes the text the Tasks.org rules give`, () => {
    const result = completeTask(fixtureTask(fixture.before), COMPLETE_NOW)
    if (!result.success) throw new Error(result.error.message)
    expect(result.output.ics).toBe(fixture.after)
    expect(result.output.kind).toBe(
      fixture.advances ? CompleteKind.Advanced : CompleteKind.Completed,
    )
    expect(result.output.task.status).toBe(
      fixture.advances ? TaskStatus.NeedsAction : TaskStatus.Completed,
    )
  })

  Deno.test(`undoing the completion of ${fixture.name} restores the previous text exactly`, () => {
    const before = fixtureTask(fixture.before)
    const result = completeTask(before, COMPLETE_NOW)
    if (!result.success) throw new Error(result.error.message)
    expect(result.output.undoIcs).toBe(fixture.before)
    // Writing those bytes back reads as the task from before.
    const restored = fixtureTask(result.output.undoIcs)
    expect(restored).toEqual(before)
  })
}

Deno.test(`a repeating task stays open and keeps its repeat rule`, () => {
  const result = completeTask(fixtureTask(RECURRING), COMPLETE_NOW)
  if (!result.success) throw new Error(result.error.message)
  expect(result.output.kind).toBe(CompleteKind.Advanced)
  expect(result.output.task.status).toBe(TaskStatus.NeedsAction)
  expect(result.output.task.repeatRule).toBe(`FREQ=DAILY;INTERVAL=1`)
  expect(result.output.task.due?.date).toBe(`2026-10-09`)
})

Deno.test(`a one-off task is completed with the date and 100 percent`, () => {
  const result = completeTask(fixtureTask(DUE_KINDS.date), COMPLETE_NOW)
  if (!result.success) throw new Error(result.error.message)
  expect(result.output.task.status).toBe(TaskStatus.Completed)
  expect(result.output.ics).toContain(`COMPLETED:20261008T123045Z`)
  expect(result.output.ics).toContain(`PERCENT-COMPLETE:100`)
})

const REFUSED: [string, string][] = [
  [`a rule that repeats from completion`, `RRULE:FREQ=DAILY;FROM=COMPLETION`],
  [`an hourly rule`, `RRULE:FREQ=HOURLY;INTERVAL=2`],
  [`a daily rule with BYDAY, which Tasks.org ignores`, `RRULE:FREQ=DAILY;BYDAY=MO`],
]

for (const [name, rule] of REFUSED) {
  Deno.test(`${name} is refused with "Complete this one in Tasks.org" and no text`, () => {
    const source = fixtureTask(
      task(`1`, `Odd`, [`DUE;VALUE=DATE:20261008`, rule]),
    )
    const result = completeTask(source, COMPLETE_NOW)
    expect(result.success).toBe(false)
    expect(result.output).toBeNull()
    expect(result.error?.code).toBe(CompleteErrorCode.UnsupportedRule)
    expect(result.error?.message).toBe(COMPLETE_IN_TASKS_ORG)
  })
}

Deno.test(`a repeating task with no due date is refused with "Complete this one in Tasks.org"`, () => {
  const result = completeTask(
    fixtureTask(task(`1`, `No due`, [`RRULE:FREQ=DAILY`])),
    COMPLETE_NOW,
  )
  expect(result.error?.code).toBe(CompleteErrorCode.NoDueDate)
  expect(result.error?.message).toBe(COMPLETE_IN_TASKS_ORG)
})

Deno.test(`a due date in a vendor time zone is refused with "Complete this one in Tasks.org"`, () => {
  const ics = vtodo([
    `DTSTAMP:20261001T080000Z`,
    `UID:vendor`,
    `SUMMARY:Vendor zone`,
    `RRULE:FREQ=DAILY`,
    `DUE;TZID=W. Europe Standard Time:20261008T090000`,
  ])
  const result = completeTask(fixtureTask(ics), COMPLETE_NOW)
  expect(result.error?.code).toBe(CompleteErrorCode.UnusableDate)
  expect(result.error?.message).toBe(COMPLETE_IN_TASKS_ORG)
})

Deno.test(`completing a task that is already completed is refused with the library's reason`, () => {
  const result = completeTask(fixtureTask(COMPLETED), COMPLETE_NOW)
  expect(result.error?.code).toBe(CompleteErrorCode.AlreadyCompleted)
  expect(result.error?.message).not.toBe(COMPLETE_IN_TASKS_ORG)
})

Deno.test(`reopening a completed task makes it open again and drops COMPLETED`, () => {
  const result = reopenTask(fixtureTask(COMPLETED), COMPLETE_NOW)
  if (!result.success) throw new Error(result.error.message)
  expect(result.output.task.status).toBe(TaskStatus.NeedsAction)
  expect(result.output.ics).not.toContain(`COMPLETED:`)
  expect(result.output.ics).not.toContain(`PERCENT-COMPLETE`)
  expect(result.output.undoIcs).toBe(COMPLETED)
})

Deno.test(`reopening a task that is not completed is refused`, () => {
  const result = reopenTask(fixtureTask(DUE_KINDS.date), COMPLETE_NOW)
  expect(result.error?.code).toBe(CompleteErrorCode.NotCompleted)
})
