import { CALDAV_PATHS, writeResultSchema } from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createTask, type NewTaskFields } from "@spy4x/time/ical-tasks-edit"
import { PRODID } from "@tasks/identity.ts"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import { offline, relay } from "./connection.ts"
import {
  createdHref,
  createOnTakenName,
  dropCreate,
  fileIdFor,
  isNameTaken,
  queueCreate,
  queueDelete,
  queuedFor,
  settle,
  withdrawQueued,
} from "./outbox.ts"
import { forget, remember, tasks } from "./task-store.ts"
import { fromOutcome, WriteKind, type WriteResult } from "./tasks.ts"

const CHANGED_ON_SERVER = `The task changed on the server. Reload it and try again.`

/** Where a new task goes: a list, and optionally the parent it becomes a subtask of. */
export interface NewTaskPlace {
  listHref: string
  parent?: Task
}

/**
 * Creates a task on the server and in the cache. Offline it is queued and sent when the network
 * returns. `uid` and `now` default to a fresh UUID version 7 and the clock; tests pass their own.
 */
export async function addTask(
  fields: NewTaskFields,
  place: NewTaskPlace,
  now = new Date(),
  uid: string = uuidV7(),
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
async function queued(
  listHref: string,
  ics: string,
  fileId: string,
  renamed = false,
): Promise<WriteResult> {
  const outcome = await queueCreate(listHref, fileId, ics)
  if (outcome.kind === `failed`) {
    // A different task holds the file name: nothing was written, so the task goes under a new one.
    if (!renamed && isNameTaken(outcome.error)) return await queued(listHref, ics, uuidV7(), true)
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
  return fromOutcome(await queueDelete(task), task)
}

/**
 * Deletes a task on the server, then drops it from the cache. Offline it is queued. Refused when
 * the server's copy changed since it was read, so a delete never removes an edit it has not seen.
 * A task whose create still waits under a file name a different task holds is only dropped from
 * the queue. Subtasks are not touched: {@link deleteTaskTree} is what the screens call. Resolves
 * with the deleted task, so Undo can {@link restoreTask} it.
 */
export async function deleteTask(given: Task): Promise<WriteResult> {
  const task = await settle(given)
  if (task === null) return { kind: WriteKind.Failed, message: CHANGED_ON_SERVER }
  // The address this task is shown at belongs to a different task: a delete sent there would
  // remove that one. The server never stored this task, so dropping its create deletes it.
  const refused = createOnTakenName(task)
  if (refused) {
    return await dropCreate(refused)
      ? { kind: WriteKind.Saved, task }
      : { kind: WriteKind.Failed, message: CHANGED_ON_SERVER }
  }
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

/**
 * Every task under `task`, however deep: its subtasks, their subtasks and so on, found by parent
 * UID among `all`, in any list and whether open or completed, as Tasks.org finds them. Deepest
 * first, so a subtask always comes before its parent. A loop of parents ends where it began.
 */
export function subtasksOf(task: Task, all: readonly Task[]): Task[] {
  const byParent = new Map<string, Task[]>()
  for (const each of all) {
    if (each.parentUid === undefined) continue
    byParent.set(each.parentUid, [...byParent.get(each.parentUid) ?? [], each])
  }
  const seen = new Set([task.uid])
  const found: Task[] = []
  const walk = (uid: string): void => {
    for (const child of byParent.get(uid) ?? []) {
      if (seen.has(child.uid)) continue
      seen.add(child.uid)
      walk(child.uid)
      found.push(child)
    }
  }
  walk(task.uid)
  return found
}

/** How {@link deleteTaskTree} went. */
export interface TreeDelete {
  /** `Saved` with the task when it and every subtask were deleted, else why some were not. */
  result: WriteResult
  /**
   * The tasks that were deleted, each before its own subtasks, so Undo can {@link restoreTask} them
   * in this order.
   */
  deleted: readonly Task[]
}

/**
 * Deletes a task and every task under it ({@link subtasksOf}), as Tasks.org does. A task with no
 * subtasks is deleted as {@link deleteTask} deletes it.
 *
 * With subtasks, every delete goes through the queue, online too, and all of them are written to
 * the queue before the first is sent: a reload or a dropped connection in the middle loses none,
 * and the whole tree leaves the screens at once. They are queued subtasks first, deepest first,
 * and the task last. The queue sends in that order and stops at the first write that cannot reach
 * the server, so what the server holds in between is the task with fewer subtasks, never a subtask
 * whose parent is gone.
 *
 * Nothing is queued when one of them cannot be deleted from this device. A delete the server
 * refuses, because that task changed elsewhere, leaves that task in place; the others still go.
 */
export async function deleteTaskTree(given: Task): Promise<TreeDelete> {
  const subtasks = subtasksOf(given, tasks.value)
  if (subtasks.length === 0) {
    const result = await deleteTask(given)
    return { result, deleted: result.kind === WriteKind.Saved ? [given] : [] }
  }
  const nothing = (message: string): TreeDelete => ({
    result: { kind: WriteKind.Failed, message },
    deleted: [],
  })
  const toQueue: Task[] = []
  const toDrop: { task: Task; entry: NonNullable<ReturnType<typeof createOnTakenName>> }[] = []
  let parent = given
  for (const each of [...subtasks, given]) {
    const task = await settle(each)
    if (task === null) {
      // A subtask that left this device meanwhile needs no delete; the task itself must be here.
      if (each === given) return nothing(CHANGED_ON_SERVER)
      continue
    }
    if (each === given) parent = task
    // Its address belongs to a different task (see `deleteTask`): only its create is dropped.
    const entry = createOnTakenName(task)
    if (entry) toDrop.push({ task, entry })
    else if (!task.etag && !queuedFor(task)) return nothing(CHANGED_ON_SERVER)
    else toQueue.push(task)
  }
  const deleted: Task[] = []
  const failures: string[] = []
  for (const { task, entry } of toDrop) {
    if (await dropCreate(entry)) deleted.push(task)
    else failures.push(CHANGED_ON_SERVER)
  }
  // Every `queueDelete` is called before the first is awaited: the queue takes its writes one at a
  // time in the order asked, so all of them are stored before any is sent.
  const results = await Promise.all(
    toQueue.map(async (task) => fromOutcome(await queueDelete(task), task)),
  )
  results.forEach((result, index) => {
    if (result.kind === WriteKind.Failed) failures.push(result.message)
    else deleted.push(toQueue[index])
  })
  const total = toDrop.length + toQueue.length
  // `toQueue` ends with the task itself; Undo wants it first.
  deleted.reverse()
  if (failures.length === 0) {
    const own = toQueue.at(-1) === parent ? results.at(-1) : undefined
    return { result: own ?? { kind: WriteKind.Saved, task: parent }, deleted }
  }
  const message = failures.length === total
    ? failures[0]
    : `${failures.length} of ${total} tasks were not deleted. ${failures[0]}`
  return { result: { kind: WriteKind.Failed, message }, deleted }
}
