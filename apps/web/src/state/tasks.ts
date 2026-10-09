import { signal } from "@preact/signals"
import { CALDAV_PATHS, taskObjectSchema, writeResultSchema } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { completeTask, reopenTask } from "@tasks/complete.ts"
import { type EditField, editTask, type TaskEdit } from "@tasks/edit.ts"
import { parseTask } from "@tasks/model.ts"
import { keepMine, rebaseEdit, RebaseKind } from "@tasks/rebase.ts"
import { type Task, TaskStatus } from "@tasks/types.ts"
import { offline, OFFLINE_NOTICE, relay } from "./connection.ts"
import { type CachedTask, cacheUnavailable, getStorage } from "./db.ts"

/** Every cached task of every list, parsed. A resource that cannot be parsed is left out. */
export const tasks = signal<Task[]>([])

/** Turns cached rows into tasks. */
export function setCachedTasks(cached: CachedTask[]): void {
  const parsed: Task[] = []
  for (const row of cached) {
    const result = parseTask({
      href: row.href,
      etag: row.etag ?? ``,
      listHref: row.calendarHref,
      ics: row.ics,
    })
    if (result.success) parsed.push(result.output)
  }
  tasks.value = parsed
}

/** The tasks of one list. */
export function tasksOf(listHref: string): Task[] {
  return tasks.value.filter((task) => task.listHref === listHref)
}

/** How a write ended. */
export enum WriteKind {
  Saved = 1,
  /** Refused: there is no network. Nothing was sent or queued; show `notice`. */
  Offline,
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
  | { kind: WriteKind.Saved; task: Task }
  | { kind: WriteKind.Offline; notice: string }
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
 * Saves an edit. Offline it is refused, never queued. A 412 reads the fresh copy, re-applies the
 * edit to it with the rebase from `@tasks/rebase.ts` and sends once more; fields that both sides
 * changed come back as a conflict. Moving a task to another list is not handled here yet.
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
      : { ok: false, message: result.error.message }
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
export function undoWrite(current: Task, ics: string): Promise<WriteResult> {
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

const offlineResult = (): WriteResult => ({ kind: WriteKind.Offline, notice: OFFLINE_NOTICE })

async function commit(base: Task, plan: Plan, edit?: TaskEdit): Promise<WriteResult> {
  if (offline.value) return offlineResult()
  // A task with no etag cannot be written until it is read again with one. The cached copy stays
  // the base, so what the server changed meanwhile is rebased, never silently overwritten.
  if (base.etag) {
    const first = plan.first(base)
    if (!first.ok) return stepFailure(first, base, edit, undefined)
    if (`alreadyDone` in first) return { kind: WriteKind.Saved, task: base }
    const put = await send(base.href, base.etag, first.ics)
    if (put.ok) return await saved(first.task, first.ics, put.etag)
    if (put.offline) return offlineResult()
    if (put.code !== ApiErrorCode.Conflict) return failed(put.message)
  }

  const fresh = await readTask(base)
  if (!fresh.ok) return fresh.result
  const theirs = fresh.task
  const second = plan.rebase(base, theirs)
  if (!second.ok) return stepFailure(second, base, edit, theirs)
  if (`alreadyDone` in second) return { kind: WriteKind.Saved, task: theirs }
  const retry = await send(theirs.href, theirs.etag, second.ics)
  if (retry.ok) return await saved(second.task, second.ics, retry.etag)
  if (retry.offline) return offlineResult()
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
): Promise<{ ok: true; task: Task } | { ok: false; result: WriteResult }> {
  const result = await relay(
    `${CALDAV_PATHS.object}?href=${encodeURIComponent(like.href)}`,
    {},
    taskObjectSchema,
  )
  if (!result.ok) {
    return { ok: false, result: result.offline ? offlineResult() : failed(result.message) }
  }
  const parsed = parseTask({
    href: result.data.href,
    etag: result.data.etag ?? ``,
    listHref: like.listHref,
    ics: result.data.ics,
  })
  if (!parsed.success) return { ok: false, result: failed(parsed.error) }
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

/** Stores `task` in the cache and swaps it into {@link tasks}. */
export async function remember(task: Task): Promise<void> {
  try {
    await getStorage().putTask({
      href: task.href,
      calendarHref: task.listHref,
      etag: task.etag || null,
      ics: task.ics,
    })
  } catch {
    // The server has the write already; a failing cache must not report it as lost.
    cacheUnavailable.value = true
  }
  const others = tasks.value.filter((other) => other.href !== task.href)
  tasks.value = [...others, task]
}
