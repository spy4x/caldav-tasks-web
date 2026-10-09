/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CompleteTodoErrorCode } from "@spy4x/time/ical-tasks"
import { COMPLETE_IN_TASKS_ORG, completeMessage } from "./identity.ts"

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
