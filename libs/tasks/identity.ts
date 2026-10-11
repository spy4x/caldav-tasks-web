/**
 * What belongs to this app in the task logic, which otherwise comes from `@spy4x/time` and
 * `@spy4x/platform`: the identity written into new tasks and the English wording of a refused
 * completion and of a refused "Keep mine".
 */

import { CompleteTodoErrorCode } from "@spy4x/time/ical-tasks"
import {
  COMPLETE_REFUSED_BY_RULE,
  type CompleteError,
  type KeepMineError,
  KeepMineStep,
} from "@spy4x/time/ical-tasks-edit"

/** The `PRODID` of every task this app creates. */
export const PRODID = `-//spy4x//caldav-tasks-web//EN`

/** What the screen shows when a repeat rule or date is outside what can be reproduced. */
export const COMPLETE_IN_TASKS_ORG = `Complete this one in Tasks.org`

/** The text to show for a refused completion: the app's wording for a rule the library refuses. */
export function completeMessage(error: CompleteError): string {
  return COMPLETE_REFUSED_BY_RULE.has(error.code as CompleteTodoErrorCode)
    ? COMPLETE_IN_TASKS_ORG
    : error.message
}

/** Shown on the card of a delete that met a change made elsewhere: what "Keep mine" does there. */
export const DELETE_KEEPS_NOTHING =
  `You deleted this task here and it was changed elsewhere. Keep mine deletes it, with those changes.`

/** Shown when the server's copy of a task cannot be read, so nothing can be kept on top of it. */
export const KEEP_MINE_UNREADABLE =
  `Keep mine is not possible: the task as it is on the server cannot be read here. Use theirs, then make your change again.`

/** The text to show when "Keep mine" was refused, by the step of `keepMineText` that refused. */
export function keepMineMessage(error: KeepMineError): string {
  if (error.step === KeepMineStep.Complete) {
    return `Keep mine is not possible: the task as it was changed elsewhere cannot be completed here. Use theirs, then complete it in Tasks.org.`
  }
  if (error.step === KeepMineStep.Reopen) {
    return `Keep mine is not possible: the task as it was changed elsewhere cannot be reopened here. Use theirs, then reopen it.`
  }
  return `Keep mine is not possible: your change does not fit the task as it was changed elsewhere. Use theirs, then make your change again.`
}
