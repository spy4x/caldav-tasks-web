import { CALDAV_PATHS, taskObjectSchema, writeResultSchema } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import {
  completeTask,
  type EditField,
  editTask,
  keepMine,
  rebaseEdit,
  RebaseKind,
  reopenTask,
  type TaskEdit,
} from "@spy4x/time/ical-tasks-edit"
import { parseTask, type Task, TaskStatus } from "@spy4x/time/ical-tasks-model"
import type { Outcome } from "@spy4x/realtime/outbox"
import { completeMessage } from "@tasks/identity.ts"
import { offline, relay } from "./connection.ts"
import { queuedFor, queueUpdate, withdrawQueued } from "./outbox.ts"
import type { TaskSnapshot } from "./pending.ts"
import { remember, tasks } from "./task-store.ts"

export { remember, setCachedTasks, tasks } from "./task-store.ts"

/** The tasks of one list. */
export function tasksOf(listHref: string): Task[] {
  return tasks.value.filter((task) => task.listHref === listHref)
}

/** How a write ended. */
export enum WriteKind {
  /** Done on the server, or queued on this device (`queued`) to be sent when the network is back. */
  Saved = 1,
  /** The same field changed on the server and in the edit. The screen asks which to keep. */
  Conflict,
  /** Refused or failed; `message` is ready to show. */
  Failed,
}

/**
 * A save that met a change from elsewhere to the same field. `theirs` is the server's copy, already
 * cached. Call {@link keepMineAfterConflict} to write the edit over it, or do nothing to use theirs.
 */
export interface TaskConflict {
  /** The copy the edit was made on. */
  base: Task
  edit: TaskEdit
  theirs: Task
  fields: EditField[]
}

export type WriteResult =
  | { kind: WriteKind.Saved; task: Task; queued?: boolean }
  | { kind: WriteKind.Conflict; conflict: TaskConflict }
  | { kind: WriteKind.Failed; message: string }

/** The patched text of a write, or why there is none, or the fields that collided. */
type Step =
  | { ok: true; task: Task; ics: string }
  /** Nothing to send: the server's copy already shows the change. */
  | { ok: true; alreadyDone: true }
  | { ok: false; message: string }
  | { ok: false; fields: EditField[] }

/** How to build a write from the copy the user saw, and again from a fresh copy after a 412. */
interface Plan {
  first(base: Task): Step
  /** Called with the fresh copy after a 412; `base` is the copy the user saw. */
  rebase(base: Task, theirs: Task): Step
}

const CHANGED_ON_SERVER = `The task changed on the server. Reload it and try again.`
const CHANGED_AGAIN = `The task changed again while saving. Try again.`

/**
 * Saves an edit. Offline it is queued and sent when the network returns. A 412 reads the fresh copy, re-applies the
 * edit to it with `rebaseEdit` from `@spy4x/time/ical-tasks-edit` and sends once more; fields that
 * both sides changed come back as a conflict. Moving a task to another list is not handled here yet.
 */
export function saveTask(task: Task, edit: TaskEdit, now = new Date()): Promise<WriteResult> {
  if (edit.listHref !== undefined && edit.listHref !== task.listHref) {
    return Promise.resolve(failed(`Moving a task to another list is not supported yet.`))
  }
  return commit(task, {
    first: (base) => fromEdit(editTask(base, edit, now)),
    rebase: (base, theirs) => {
      const result = rebaseEdit(base, edit, theirs, now)
      if (!result.success) return { ok: false, message: result.error }
      if (result.output.kind === RebaseKind.Collision) {
        return { ok: false, fields: result.output.fields }
      }
      return { ok: true, task: result.output.task, ics: result.output.ics }
    },
  }, edit)
}

const isDone = (task: Task) => task.status === TaskStatus.Completed
const sameDates = (a: Task, b: Task) => sameDate(a.due, b.due) && sameDate(a.start, b.start)

function sameDate(a: Task[`due`], b: Task[`due`]): boolean {
  if (!a || !b) return a === b
  return a.kind === b.kind && a.date === b.date && a.time === b.time && a.tzid === b.tzid
}

/**
 * Completes an open task or reopens a completed one. After a 412 the same change is made on the
 * fresh copy; there is no field to collide on.
 */
export function setTaskDone(task: Task, done: boolean, now = new Date()): Promise<WriteResult> {
  const change = (current: Task): Step => {
    const result = done ? completeTask(current, now) : reopenTask(current, now)
    return result.success
      ? { ok: true, task: result.output.task, ics: result.output.ics }
      : { ok: false, message: completeMessage(result.error) }
  }
  if ((task.status === TaskStatus.Completed) === done) {
    return Promise.resolve({ kind: WriteKind.Saved, task })
  }
  return commit(task, {
    first: change,
    rebase: (base, theirs) => {
      // Re-applying to a copy someone else already completed would advance a repeating task twice.
      if (isDone(theirs) === done) return { ok: true, alreadyDone: true }
      if (sameDates(base, theirs) && theirs.status === base.status) return change(theirs)
      // A repeating task completed elsewhere stays open with the dates completing it gives. Any
      // other move, such as a reschedule, is not a completion and must not swallow this one.
      if (done && base.repeatRule) {
        const expected = change(base)
        if (
          expected.ok && `task` in expected && sameDates(expected.task, theirs) &&
          theirs.status === expected.task.status
        ) return { ok: true, alreadyDone: true }
      }
      return { ok: false, message: CHANGED_ON_SERVER }
    },
  })
}

/**
 * Writes `edit` over the server's copy after a {@link TaskConflict}: the colliding fields take the
 * edit's values, every other server change stays.
 */
export function keepMineAfterConflict(
  conflict: TaskConflict,
  now = new Date(),
): Promise<WriteResult> {
  return commit(conflict.theirs, {
    first: () => fromEdit(keepMine(conflict.base, conflict.edit, conflict.theirs, now)),
    rebase: () => ({ ok: false, message: CHANGED_AGAIN }),
  })
}

/**
 * Undoes a write by sending `ics`, the text from before it, over `current`, the copy the write
 * produced. Refused with a message when someone changed the task since: an undo must never wipe
 * out a newer edit from another device.
 */
export async function undoWrite(current: Task, ics: string): Promise<WriteResult> {
  // A write still waiting in the queue is taken back there; nothing has reached the server.
  if (queuedFor(current) && await withdrawQueued(current)) {
    const back = tasks.value.find((task) => task.href === current.href)
    if (back) return { kind: WriteKind.Saved, task: back, queued: true }
  }
  return commit(current, {
    first: () => {
      const parsed = parseTask({
        href: current.href,
        etag: current.etag,
        listHref: current.listHref,
        ics,
      })
      return parsed.success ? { ok: true, task: parsed.output, ics } : {
        ok: false,
        message: parsed.error,
      }
    },
    rebase: () => ({ ok: false, message: CHANGED_ON_SERVER }),
  })
}

function fromEdit(
  result: ReturnType<typeof editTask>,
): Step {
  return result.success
    ? { ok: true, task: result.output.task, ics: result.output.ics }
    : { ok: false, message: result.error }
}

function failed(message: string): WriteResult {
  return { kind: WriteKind.Failed, message }
}

const NOT_SYNCED_YET = `This task has no version from the server yet. Wait until you are online.`

/** How the outbox answered a queued write, as the screens read it. */
function fromOutcome(outcome: Outcome<TaskSnapshot>, written: Task): WriteResult {
  if (outcome.kind === `failed`) {
    return failed(outcome.error instanceof Error ? outcome.error.message : CHANGED_ON_SERVER)
  }
  const etag = outcome.kind === `sent` ? outcome.server?.etag ?? `` : written.etag
  return { kind: WriteKind.Saved, task: { ...written, etag }, queued: outcome.kind !== `sent` }
}

/** Queues the write `step` made from `base`, to be sent when the network allows. */
async function queueStep(base: Task, step: Extract<Step, { ok: true; ics: string }>) {
  // A task the server has not given a version cannot be written yet, unless a create waits for it.
  if (!base.etag && !queuedFor(base)) return failed(NOT_SYNCED_YET)
  return fromOutcome(await queueUpdate(base, step.ics), step.task)
}

/** Builds the write from the copy the person saw and queues it. */
async function queueFirst(base: Task, plan: Plan, edit?: TaskEdit): Promise<WriteResult> {
  const first = plan.first(base)
  if (!first.ok) return stepFailure(first, base, edit, undefined)
  if (`alreadyDone` in first) return { kind: WriteKind.Saved, task: base }
  return await queueStep(base, first)
}

async function commit(base: Task, plan: Plan, edit?: TaskEdit): Promise<WriteResult> {
  // Offline, or behind a write that still waits: this one joins the queue, in order.
  if (offline.value || queuedFor(base)) return await queueFirst(base, plan, edit)
  // A task with no etag cannot be written until it is read again with one. The cached copy stays
  // the base, so what the server changed meanwhile is rebased, never silently overwritten.
  if (base.etag) {
    const first = plan.first(base)
    if (!first.ok) return stepFailure(first, base, edit, undefined)
    if (`alreadyDone` in first) return { kind: WriteKind.Saved, task: base }
    const put = await send(base.href, base.etag, first.ics)
    if (put.ok) return await saved(first.task, first.ics, put.etag)
    if (put.offline) return await queueFirst(base, plan, edit)
    if (put.code !== ApiErrorCode.Conflict) return failed(put.message)
  }

  const fresh = await readTask(base)
  if (!fresh.ok) return fresh.offline ? await queueFirst(base, plan, edit) : fresh.result
  const theirs = fresh.task
  const second = plan.rebase(base, theirs)
  if (!second.ok) return stepFailure(second, base, edit, theirs)
  if (`alreadyDone` in second) return { kind: WriteKind.Saved, task: theirs }
  const retry = await send(theirs.href, theirs.etag, second.ics)
  if (retry.ok) return await saved(second.task, second.ics, retry.etag)
  if (retry.offline) return await queueStep(theirs, second)
  if (retry.code === ApiErrorCode.Conflict) return failed(CHANGED_AGAIN)
  return failed(retry.message)
}

function stepFailure(
  step: Extract<Step, { ok: false }>,
  base: Task,
  edit: TaskEdit | undefined,
  theirs: Task | undefined,
): WriteResult {
  if (`fields` in step && edit && theirs) {
    return {
      kind: WriteKind.Conflict,
      conflict: { base, edit, theirs, fields: step.fields },
    }
  }
  return failed(`message` in step ? step.message : CHANGED_AGAIN)
}

type Sent =
  | { ok: true; etag: string | null }
  | { ok: false; offline: boolean; code: ApiErrorCode | null; message: string }

async function send(href: string, etag: string, ics: string): Promise<Sent> {
  const result = await relay(
    CALDAV_PATHS.object,
    { method: `PUT`, body: { href, etag, ics } },
    writeResultSchema,
  )
  return result.ok ? { ok: true, etag: result.data.etag } : result
}

/** Reads the server's current copy of `like` and caches it. */
async function readTask(
  like: Task,
): Promise<
  { ok: true; task: Task } | { ok: false; offline: boolean; result: WriteResult }
> {
  const result = await relay(
    `${CALDAV_PATHS.object}?href=${encodeURIComponent(like.href)}`,
    {},
    taskObjectSchema,
  )
  if (!result.ok) {
    return { ok: false, offline: result.offline, result: failed(result.message) }
  }
  const parsed = parseTask({
    href: result.data.href,
    etag: result.data.etag ?? ``,
    listHref: like.listHref,
    ics: result.data.ics,
  })
  if (!parsed.success) return { ok: false, offline: false, result: failed(parsed.error) }
  await remember(parsed.output)
  return { ok: true, task: parsed.output }
}

async function saved(written: Task, ics: string, etag: string | null): Promise<WriteResult> {
  let task: Task = { ...written, ics, etag: etag ?? `` }
  if (!etag) {
    // The server sent no etag: read the task again to learn its version.
    const fresh = await readTask(task)
    if (fresh.ok) task = fresh.task
  }
  await remember(task)
  return { kind: WriteKind.Saved, task }
}
