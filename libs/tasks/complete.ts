/**
 * Completes and reopens a task the way Tasks.org does, on top of `@spy4x/time`. A one-off task is
 * marked completed; a repeating one moves its dates to the next occurrence and stays open. A
 * repeat rule the library does not reproduce is refused, never guessed.
 *
 * Every success carries `undoIcs`, the exact text from before, so an Undo writes back the previous
 * bytes (the caller sends them with the new etag).
 */

import { type IcalComponent, parseIcal, serializeIcal } from "@spy4x/time/ical"
import {
  completeTodo,
  CompleteTodoErrorCode,
  CompleteTodoKind,
  reopenTodo,
} from "@spy4x/time/ical-tasks"
import { parseTask } from "./model.ts"
import type { Task } from "./types.ts"

export { CompleteTodoErrorCode as CompleteErrorCode, CompleteTodoKind as CompleteKind }

/** What the screen shows when a repeat rule or date is outside what can be reproduced. */
export const COMPLETE_IN_TASKS_ORG = `Complete this one in Tasks.org`

export interface CompleteError {
  code: CompleteTodoErrorCode
  /** Ready to show. For a refusal of the rule or the dates it is {@link COMPLETE_IN_TASKS_ORG}. */
  message: string
}

export type CompleteResult =
  | { success: true; output: CompleteOutput; error: null }
  | { success: false; output: null; error: CompleteError }

export interface CompleteOutput {
  /** Whether the task advanced to its next occurrence or is completed. */
  kind: CompleteTodoKind
  /** The task as it reads after the change. */
  task: Task
  /** The text to send. */
  ics: string
  /** The text from before, byte for byte. Writing it back undoes the change. */
  undoIcs: string
}

const REFUSED_BY_RULE = new Set([
  CompleteTodoErrorCode.UnsupportedRule,
  CompleteTodoErrorCode.NoDueDate,
  CompleteTodoErrorCode.UnusableDate,
])

/** Completes `task`; a repeating task moves to its next occurrence instead. */
export function completeTask(task: Task, now: Date): CompleteResult {
  return change(task, (root) => {
    const result = completeTodo(root, { now })
    return result.success
      ? { success: true, kind: result.output.kind }
      : { success: false, error: result.error }
  })
}

/**
 * Reopens a completed task. It undoes the completion of a task that ended its series; to undo the
 * move of a repeating task, write back the `undoIcs` of that completion.
 */
export function reopenTask(task: Task, now: Date): CompleteResult {
  return change(task, (root) => {
    const result = reopenTodo(root, { now })
    return result.success
      ? { success: true, kind: CompleteTodoKind.Completed }
      : { success: false, error: result.error }
  })
}

type Step =
  | { success: true; kind: CompleteTodoKind }
  | { success: false; error: { code: CompleteTodoErrorCode; message: string } }

function change(task: Task, run: (root: IcalComponent) => Step): CompleteResult {
  const parsed = parseIcal(task.ics)
  if (!parsed.success) return fail(CompleteTodoErrorCode.NoTodo, parsed.error.message)
  const step = run(parsed.output)
  if (!step.success) {
    const { code, message } = step.error
    return fail(code, REFUSED_BY_RULE.has(code) ? COMPLETE_IN_TASKS_ORG : message)
  }
  const ics = serializeIcal(parsed.output)
  const read = parseTask({ href: task.href, etag: task.etag, listHref: task.listHref, ics })
  if (!read.success) return fail(CompleteTodoErrorCode.NoTodo, read.error)
  return {
    success: true,
    output: { kind: step.kind, task: read.output, ics, undoIcs: task.ics },
    error: null,
  }
}

function fail(code: CompleteTodoErrorCode, message: string): CompleteResult {
  return { success: false, output: null, error: { code, message } }
}
