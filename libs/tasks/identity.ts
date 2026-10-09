/**
 * What belongs to this app in the task logic, which otherwise comes from `@spy4x/time` and
 * `@spy4x/platform`: the identity written into new tasks and the English wording of a refused
 * completion.
 */

import { CompleteTodoErrorCode } from "@spy4x/time/ical-tasks"
import { COMPLETE_REFUSED_BY_RULE, type CompleteError } from "@spy4x/time/ical-tasks-edit"

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
