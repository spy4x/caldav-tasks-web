import { CALDAV_PATHS, writeResultSchema } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { createTask, type NewTaskFields } from "@spy4x/time/ical-tasks-edit"
import { PRODID } from "@tasks/identity.ts"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import { offline, relay } from "./connection.ts"
import {
  createdHref,
  fileIdFor,
  queueCreate,
  queueDelete,
  queuedFor,
  settle,
  withdrawQueued,
} from "./outbox.ts"
import { forget, remember } from "./task-store.ts"
import { WriteKind, type WriteResult } from "./tasks.ts"

const CHANGED_ON_SERVER = `The task changed on the server. Reload it and try again.`

/** Where a new task goes: a list, and optionally the parent it becomes a subtask of. */
export interface NewTaskPlace {
  listHref: string
  parent?: Task
}

/**
 * Creates a task on the server and in the cache. Offline it is queued and sent when the network
 * returns. `uid` and `now` default to a fresh random UID and the clock; tests pass their own.
 */
export async function addTask(
  fields: NewTaskFields,
  place: NewTaskPlace,
  now = new Date(),
  uid: string = crypto.randomUUID(),
): Promise<WriteResult> {
  const built = createTask(fields, {
    uid,
    now,
    prodid: PRODID,
    listHref: place.listHref,
    parent: place.parent,
  })
  if (!built.success) return { kind: WriteKind.Failed, message: built.error }
  return await post(built.output.listHref, built.output.ics, uid)
}

/**
 * Puts a deleted task back: the same text, created again in its list. This is Undo for a delete.
 */
export async function restoreTask(task: Task): Promise<WriteResult> {
  // A delete still waiting in the queue is taken back there; the server never heard of it.
  if (queuedFor(task) && await withdrawQueued(task)) {
    return { kind: WriteKind.Saved, task, queued: true }
  }
  return await post(task.listHref, task.ics, task.uid)
}

/** Queues a create and answers with the task as it will be once the server has it. */
async function queued(listHref: string, ics: string, fileId: string): Promise<WriteResult> {
  const outcome = await queueCreate(listHref, fileId, ics)
  if (outcome.kind === `failed`) {
    const message = outcome.error instanceof Error ? outcome.error.message : CHANGED_ON_SERVER
    return { kind: WriteKind.Failed, message }
  }
  const parsed = parseTask({ href: createdHref(listHref, fileId), etag: ``, listHref, ics })
  if (!parsed.success) return { kind: WriteKind.Failed, message: parsed.error }
  return { kind: WriteKind.Saved, task: parsed.output, queued: true }
}

async function post(listHref: string, ics: string, uid: string): Promise<WriteResult> {
  const fileId = fileIdFor(uid)
  if (offline.value) return await queued(listHref, ics, fileId)
  // The object is named after the task, so a create whose answer was lost and is sent again finds
  // its own object instead of making a second one.
  const result = await relay(
    CALDAV_PATHS.objects,
    { method: `POST`, body: { calendar: listHref, ics, name: `${fileId}.ics` } },
    writeResultSchema,
  )
  if (!result.ok) {
    return result.offline
      ? await queued(listHref, ics, fileId)
      : { kind: WriteKind.Failed, message: result.message }
  }
  const parsed = parseTask({
    href: result.data.href,
    etag: result.data.etag ?? ``,
    listHref,
    ics,
  })
  if (!parsed.success) return { kind: WriteKind.Failed, message: parsed.error }
  await remember(parsed.output)
  return { kind: WriteKind.Saved, task: parsed.output }
}

/** Queues a delete. The task leaves the screens at once; the server hears of it later. */
async function queuedDelete(task: Task): Promise<WriteResult> {
  if (!task.etag && !queuedFor(task)) {
    return { kind: WriteKind.Failed, message: CHANGED_ON_SERVER }
  }
  const outcome = await queueDelete(task)
  if (outcome.kind === `failed`) {
    const message = outcome.error instanceof Error ? outcome.error.message : CHANGED_ON_SERVER
    return { kind: WriteKind.Failed, message }
  }
  return { kind: WriteKind.Saved, task, queued: outcome.kind !== `sent` }
}

/**
 * Deletes a task on the server, then drops it from the cache. Offline it is queued. Refused when
 * the server's copy changed since it was read, so a delete never removes an edit it has not seen.
 * Subtasks are not touched. Resolves with the deleted task, so Undo can {@link restoreTask} it.
 */
export async function deleteTask(given: Task): Promise<WriteResult> {
  const task = await settle(given)
  if (offline.value || queuedFor(task)) return await queuedDelete(task)
  if (!task.etag) return { kind: WriteKind.Failed, message: CHANGED_ON_SERVER }
  const result = await relay(CALDAV_PATHS.object, {
    method: `DELETE`,
    body: { href: task.href, etag: task.etag },
  })
  if (!result.ok) {
    if (result.offline) return await queuedDelete(task)
    return {
      kind: WriteKind.Failed,
      message: result.code === ApiErrorCode.Conflict ? CHANGED_ON_SERVER : result.message,
    }
  }
  await forget(task.href)
  return { kind: WriteKind.Saved, task }
}
