import { CALDAV_PATHS, writeResultSchema } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { createTask, type NewTaskFields } from "@spy4x/time/ical-tasks-edit"
import { PRODID } from "@tasks/identity.ts"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import { offline, OFFLINE_NOTICE, relay } from "./connection.ts"
import { cacheUnavailable, getStorage } from "./db.ts"
import { remember, tasks, WriteKind, type WriteResult } from "./tasks.ts"

const CHANGED_ON_SERVER = `The task changed on the server. Reload it and try again.`

/** Where a new task goes: a list, and optionally the parent it becomes a subtask of. */
export interface NewTaskPlace {
  listHref: string
  parent?: Task
}

/**
 * Creates a task on the server and in the cache. Offline it is refused, never queued. `uid` and
 * `now` default to a fresh random UID and the clock; tests pass their own.
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
  return await post(built.output.listHref, built.output.ics)
}

/**
 * Puts a deleted task back: the same text, created again in its list. This is Undo for a delete.
 */
export function restoreTask(task: Task): Promise<WriteResult> {
  return post(task.listHref, task.ics)
}

async function post(listHref: string, ics: string): Promise<WriteResult> {
  if (offline.value) return { kind: WriteKind.Offline, notice: OFFLINE_NOTICE }
  const result = await relay(
    CALDAV_PATHS.objects,
    { method: `POST`, body: { calendar: listHref, ics } },
    writeResultSchema,
  )
  if (!result.ok) {
    return result.offline
      ? { kind: WriteKind.Offline, notice: OFFLINE_NOTICE }
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

/**
 * Deletes a task on the server, then drops it from the cache. Refused when the server's copy
 * changed since it was read, so a delete never removes an edit it has not seen. Subtasks are not
 * touched. Resolves with the deleted task, so Undo can {@link restoreTask} it.
 */
export async function deleteTask(task: Task): Promise<WriteResult> {
  if (offline.value) return { kind: WriteKind.Offline, notice: OFFLINE_NOTICE }
  if (!task.etag) return { kind: WriteKind.Failed, message: CHANGED_ON_SERVER }
  const result = await relay(CALDAV_PATHS.object, {
    method: `DELETE`,
    body: { href: task.href, etag: task.etag },
  })
  if (!result.ok) {
    if (result.offline) return { kind: WriteKind.Offline, notice: OFFLINE_NOTICE }
    return {
      kind: WriteKind.Failed,
      message: result.code === ApiErrorCode.Conflict ? CHANGED_ON_SERVER : result.message,
    }
  }
  try {
    await getStorage().deleteTask(task.href)
  } catch {
    // The server has the delete already; a failing cache must not report it as lost.
    cacheUnavailable.value = true
  }
  tasks.value = tasks.value.filter((other) => other.href !== task.href)
  return { kind: WriteKind.Saved, task }
}
