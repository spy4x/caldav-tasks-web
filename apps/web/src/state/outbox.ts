import {
  type CalDavError,
  CalDavErrorCode,
  type CalDavObject,
  type CalDavResult,
} from "@spy4x/caldav"
import { type CalDavWriter, createCalDavWriteTransport, isSafeEntityId } from "@spy4x/caldav/write"
import {
  createMemoryOutboxStore,
  createOutbox,
  createPromiseLock,
  createWebLock,
  type LockManagerLike,
  type Outbox,
  type OutboxLock,
  type OutboxStore,
  type Outcome,
} from "@spy4x/realtime/outbox"
import { createIndexedDbOutboxStore } from "@spy4x/realtime/outbox-indexeddb"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import {
  CALDAV_PATHS,
  createObjectRequestSchema,
  taskObjectSchema,
  writeResultSchema,
} from "@api/caldav.ts"
import { ApiErrorCode } from "@api/errors.ts"
import { calendars } from "./calendars.ts"
import { connection, relay, type RelayResult } from "./connection.ts"
import {
  entryFor,
  pendingEntries,
  type TaskEntry,
  type TaskPayload,
  type TaskSnapshot,
  versionOf,
} from "./pending.ts"
import { forget, remember, serverTasks } from "./task-store.ts"

/**
 * The origin the CalDAV transport puts in front of every address. The browser never talks to the
 * CalDAV server: it talks to the relay, which takes an href. The transport wants absolute URLs, so
 * the adapter below adds this origin to what it hands out and strips it from what it receives.
 * Nothing is ever requested from it.
 */
const RELAY_ORIGIN = `https://relay.invalid`

const hrefOf = (url: string | URL): string => new URL(url).pathname

const withSlash = (href: string): string => href.endsWith(`/`) ? href : `${href}/`

/** The address a task created offline will have once the server stores it. */
export function createdHref(listHref: string, fileId: string): string {
  return `${withSlash(listHref)}${fileId}.ics`
}

/** A relay failure told the way the CalDAV client tells it, so the transport can classify it. */
function failure(result: Extract<RelayResult<unknown>, { ok: false }>): CalDavResult<never> {
  const error: CalDavError = {
    code: codeOf(result),
    message: result.message,
    ...(result.status > 0 ? { status: result.status } : {}),
  }
  return { success: false, output: null, error }
}

function codeOf(result: Extract<RelayResult<unknown>, { ok: false }>): CalDavErrorCode {
  if (result.offline) return CalDavErrorCode.Network
  switch (result.code) {
    case ApiErrorCode.Conflict:
      return CalDavErrorCode.Conflict
    case ApiErrorCode.NotFound:
      return CalDavErrorCode.NotFound
    case ApiErrorCode.AlreadyExists:
      return CalDavErrorCode.AlreadyExists
    case ApiErrorCode.UidConflict:
      return CalDavErrorCode.UidConflict
    case ApiErrorCode.BadRequest:
      return CalDavErrorCode.InvalidArgument
    case ApiErrorCode.TooLarge:
      return CalDavErrorCode.TooLarge
    // Everything else, a refused session or account and an unreachable CalDAV server included,
    // the transport classifies by the status it carries.
    default:
      return CalDavErrorCode.Server
  }
}

/** The four object calls of the CalDAV client, answered by the relay. */
const writer: CalDavWriter = {
  async getObject(url) {
    const result = await relay(
      `${CALDAV_PATHS.object}?href=${encodeURIComponent(hrefOf(url))}`,
      {},
      taskObjectSchema,
    )
    if (!result.ok) return failure(result)
    const object: CalDavObject = {
      url: `${RELAY_ORIGIN}${result.data.href}`,
      etag: result.data.etag,
      data: result.data.ics,
    }
    return { success: true, output: object, error: null }
  },
  async createObject(calendarUrl, ics, options) {
    const body = createObjectRequestSchema.assert({
      calendar: hrefOf(calendarUrl),
      ics,
      ...(options?.name === undefined ? {} : { name: options.name }),
    })
    const result = await relay(CALDAV_PATHS.objects, { method: `POST`, body }, writeResultSchema)
    if (!result.ok) return failure(result)
    return {
      success: true,
      output: { url: `${RELAY_ORIGIN}${result.data.href}`, etag: result.data.etag },
      error: null,
    }
  },
  async updateObject(url, ics, etag) {
    const result = await relay(
      CALDAV_PATHS.object,
      { method: `PUT`, body: { href: hrefOf(url), etag, ics } },
      writeResultSchema,
    )
    if (!result.ok) return failure(result)
    return {
      success: true,
      output: { url: `${RELAY_ORIGIN}${result.data.href}`, etag: result.data.etag },
      error: null,
    }
  },
  async deleteObject(url, etag) {
    const result = await relay(CALDAV_PATHS.object, {
      method: `DELETE`,
      body: { href: hrefOf(url), etag },
    })
    return result.ok ? { success: true, output: null, error: null } : failure(result)
  },
}

/**
 * The address of an entity. A task that exists has its address for an id; one created on this
 * device is named by a plain file id until the server has it.
 */
function entityHref(entityId: string): string {
  const created = pendingEntries.value.find((entry) =>
    entry.entityId === entityId && entry.kind === `create`
  )
  if (created) return created.payload.href
  if (entityId.includes(`/`)) return entityId
  return serverTasks.value.find((task) => task.href.endsWith(`/${entityId}.ics`))?.href ?? entityId
}

/** The list a server object belongs to: the listed calendar its address is under. */
function listOf(href: string): string {
  const known = calendars.value
    .filter((calendar) => href.startsWith(withSlash(calendar.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return known?.href ?? href.slice(0, href.lastIndexOf(`/`) + 1)
}

const transport = createCalDavWriteTransport<TaskPayload, TaskSnapshot>({
  writer,
  calendarUrl: (command) => `${RELAY_ORIGIN}${withSlash(command.payload.listHref)}`,
  urlOf: (entityId) => `${RELAY_ORIGIN}${entityHref(entityId)}`,
  etagOf(command) {
    // The copy the write was based on, while the cache still holds it. After "keep mine" the
    // cache holds the server's newer copy, which the write is then based on.
    const cached = serverTasks.value.find((task) => task.href === command.payload.href)
    if (cached && versionOf(cached.etag) === command.baseVersion) return cached.etag
    return command.payload.baseEtag
  },
  toIcs: (command) => command.payload.ics,
  toEntity(object) {
    const href = hrefOf(object.url)
    return {
      version: versionOf(object.etag),
      href,
      listHref: listOf(href),
      etag: object.etag,
      ics: object.data,
    }
  },
})

/** The sends under way, by entity id, so a follow-up write can wait for its task's send. */
const inFlight = new Set<string>()

const trackedSend: typeof transport.send = async (command, key) => {
  inFlight.add(command.entityId)
  try {
    return await transport.send(command, key)
  } finally {
    inFlight.delete(command.entityId)
  }
}

/**
 * The copy of `task` to build a new write on. While a send for the task is under way its etag is
 * about to change (a created task has none yet), so this waits for that send to settle and returns
 * the cached copy it left. Otherwise returns `task` itself.
 */
export async function settle(task: Task): Promise<Task> {
  if (!inFlight.has(entityIdOf(task))) return task
  await getOutbox().flush()
  return serverTasks.value.find((other) => other.href === task.href) ?? task
}

/** Reads a server snapshot as a task, or `null` when its text cannot be read. */
function taskOf(snapshot: TaskSnapshot): Task | null {
  const parsed = parseTask({
    href: snapshot.href,
    etag: snapshot.etag ?? ``,
    listHref: snapshot.listHref,
    ics: snapshot.ics,
  })
  return parsed.success ? parsed.output : null
}

const LOCK_NAME = `caldav-tasks-outbox`

function defaultLock(): OutboxLock {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks
  return locks ? createWebLock(locks, LOCK_NAME) : createPromiseLock()
}

type TaskOutbox = Outbox<TaskPayload, TaskSnapshot>

let current: TaskOutbox | undefined
let storeOverride: OutboxStore<TaskPayload, TaskSnapshot> | undefined
let stopListening: (() => void) | undefined

/** The app's outbox, opened on first use. */
export function getOutbox(): TaskOutbox {
  if (current) return current
  const outbox = createOutbox<TaskPayload, TaskSnapshot>({
    store: storeOverride ??
      createIndexedDbOutboxStore<TaskPayload, TaskSnapshot>({ name: `caldav-tasks-outbox` }),
    send: trackedSend,
    fetchServer: transport.fetchServer,
    classify: transport.classify,
    lock: defaultLock(),
    // The browser's own word: a failed request must not stop the next try, which is how the app
    // finds out the server is back.
    canSend: () => connection.online.value,
    cache: {
      async put(snapshot) {
        const task = taskOf(snapshot)
        if (task) await remember(task)
      },
      remove: (entityId) => forget(entityHref(entityId)),
    },
  })
  stopListening = outbox.subscribe((entries) => {
    pendingEntries.value = entries
  })
  current = outbox
  return outbox
}

/**
 * Swaps where the queue is kept, for a test. A fresh outbox is built on next use. `undefined`
 * goes back to IndexedDB.
 */
export function useOutboxStore(store: OutboxStore<TaskPayload, TaskSnapshot> | undefined): void {
  stopListening?.()
  stopListening = undefined
  current = undefined
  storeOverride = store
  pendingEntries.value = []
}

/** A store in memory, for tests. */
export const createTestOutboxStore = (): OutboxStore<TaskPayload, TaskSnapshot> =>
  createMemoryOutboxStore<TaskPayload, TaskSnapshot>()

/** Reads the queue from its store, so the screens show writes made before a restart. */
export async function loadOutbox(): Promise<void> {
  try {
    await getOutbox().reload()
  } catch {
    // IndexedDB blocked: the app runs without a queue, as it does without a cache.
  }
}

/** The id the queue knows a task by: its file id while a create waits, else its address. */
export function entityIdOf(task: Task): string {
  const entry = entryFor(task.href, pendingEntries.value)
  return entry?.entityId ?? task.href
}

/** The file id a new task's object is named by: its UID when that is a plain file name. */
export function fileIdFor(uid: string): string {
  return isSafeEntityId(uid) ? uid : crypto.randomUUID()
}

/** The queued write for a task, if one is waiting. */
export function queuedFor(task: Task): TaskEntry | undefined {
  return entryFor(task.href, pendingEntries.value)
}

/** Queues the new text of a task (an edit, or a completion). `base` is the copy the person saw. */
export function queueUpdate(base: Task, ics: string): Promise<Outcome<TaskSnapshot>> {
  return getOutbox().submit({
    kind: `update`,
    entityId: entityIdOf(base),
    version: versionOf(base.etag),
    payload: { href: base.href, listHref: base.listHref, ics, baseEtag: base.etag },
  })
}

/** Queues the delete of a task. A task created offline and never sent is simply forgotten. */
export function queueDelete(task: Task): Promise<Outcome<TaskSnapshot>> {
  return getOutbox().submit({
    kind: `delete`,
    entityId: entityIdOf(task),
    version: versionOf(task.etag),
    payload: { href: task.href, listHref: task.listHref, ics: task.ics, baseEtag: task.etag },
  })
}

/** Queues a new task. `fileId` names its object, so a repeated send finds the same one. */
export function queueCreate(
  listHref: string,
  fileId: string,
  ics: string,
): Promise<Outcome<TaskSnapshot>> {
  return getOutbox().submit({
    kind: `create`,
    entityId: fileId,
    payload: { href: createdHref(listHref, fileId), listHref, ics, baseEtag: `` },
  })
}

/**
 * Takes back the queued write of a task, for Undo. Resolves `false` when none can be taken back,
 * such as one already sent; the caller then undoes it on the server.
 */
export function withdrawQueued(task: Task): Promise<boolean> {
  return getOutbox().withdraw(entityIdOf(task))
}
