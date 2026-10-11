/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CompleteTodoErrorCode } from "@spy4x/time/ical-tasks"
import { KeepMineStep } from "@spy4x/time/ical-tasks-edit"
import { COMPLETE_IN_TASKS_ORG, completeMessage, keepMineMessage } from "./identity.ts"

Deno.test(`a repeat rule the library cannot reproduce is worded as complete it in Tasks.org`, () => {
  for (
    const code of [
      CompleteTodoErrorCode.UnsupportedRule,
      CompleteTodoErrorCode.NoDueDate,
      CompleteTodoErrorCode.UnusableDate,
    ]
  ) {
    expect(completeMessage({ code, message: `library wording` })).toBe(COMPLETE_IN_TASKS_ORG)
  }
})

Deno.test(`a text that is not a task keeps the library's message`, () => {
  const error = { code: CompleteTodoErrorCode.NoTodo, message: `no VTODO` }
  expect(completeMessage(error)).toBe(`no VTODO`)
})

const refusedAt = (step: KeepMineStep) => keepMineMessage({ step, message: `library wording` })

Deno.test(`a Keep mine refused at a reopening says to use theirs and reopen the task`, () => {
  const text = refusedAt(KeepMineStep.Reopen)
  expect(text).toContain(`cannot be reopened here`)
  expect(text).toContain(`Use theirs, then reopen it.`)
})

Deno.test(`a Keep mine refused at a field, or at a text that does not read, says to use theirs and make the change again`, () => {
  for (const step of [KeepMineStep.Edit, KeepMineStep.Read]) {
    const text = refusedAt(step)
    expect(text).toContain(`your change does not fit`)
    expect(text).toContain(`Use theirs, then make your change again.`)
  }
})
