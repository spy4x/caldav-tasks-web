import { computed, signal } from "@preact/signals"
import { keepMineText } from "@spy4x/time/ical-tasks-edit"
import { parseTask } from "@spy4x/time/ical-tasks-model"
import type { ConflictKind } from "@spy4x/preact-system/conflict-chooser"
import { DELETE_KEEPS_NOTHING, KEEP_MINE_UNREADABLE, keepMineMessage } from "@tasks/identity.ts"
import { getOutbox } from "./outbox.ts"
import { pendingEntries, type TaskEntry } from "./pending.ts"

/** A queued write the server did not take, as the screen lists it. */
export interface TaskConflictItem {
  /** The entry's `seq`, as text. */
  id: string
  /** The task's title, or its address when the text cannot be read. */
  label: string
  reason: ConflictKind
  message: string
  /** `false` once "Keep mine" was refused for this conflict: only the server's version is left. */
  canKeepMine?: boolean
}

/** Why "Keep mine" was refused, and the queued text it was refused for. */
interface Refusal {
  ics: string
  message: string
}

/**
 * Every refused "Keep mine", by the idempotency key of the conflict it was refused for. A newer
 * conflict of the same write has a new key, so it starts without a refusal.
 */
const refusals = signal<ReadonlyMap<string, Refusal>>(new Map())

/**
 * The refusal that still holds for a queued write. A later edit or a delete of the task can keep
 * the key (the queue renews it only for a write it has sent), so a refusal counts only while the
 * write is the edit, with the text, it was made for.
 */
function refusalOf(entry: TaskEntry): string | undefined {
  const refusal = refusals.value.get(entry.key)
  return entry.kind === `update` && refusal?.ics === entry.payload.ics ? refusal.message : undefined
}

const conflictEntries = computed(() => pendingEntries.value.filter(isConflict))

function isConflict(entry: TaskEntry): boolean {
  return entry.status === `conflict` && entry.seq !== undefined
}

function titleOf(entry: TaskEntry): string {
  const { href, listHref, ics, baseEtag } = entry.payload
  const parsed = parseTask({ href, etag: baseEtag, listHref, ics })
  return parsed.success && parsed.output.title ? parsed.output.title : href
}

/** What the card says under the title: a refusal first, then what a delete would do. */
function messageOf(entry: TaskEntry, refusal: string | undefined): string {
  if (refusal !== undefined) return refusal
  if (entry.kind === `delete` && entry.conflict?.reason === `version`) return DELETE_KEEPS_NOTHING
  return entry.conflict?.message ?? ``
}

/** Every write waiting for the person to choose, in the order they were made. */
export const conflicts = computed<TaskConflictItem[]>(() =>
  conflictEntries.value.map((entry) => {
    const refusal = refusalOf(entry)
    const item: TaskConflictItem = {
      id: String(entry.seq),
      label: titleOf(entry),
      reason: entry.conflict?.reason ?? `rejected`,
      message: messageOf(entry, refusal),
    }
    if (refusal !== undefined) item.canKeepMine = false
    return item
  })
)

function find(id: string): TaskEntry | undefined {
  return conflictEntries.value.find((entry) => String(entry.seq) === id)
}

function refuse(entry: TaskEntry, message: string): string {
  refusals.value = new Map(refusals.value).set(entry.key, { ics: entry.payload.ics, message })
  return message
}

/**
 * Sends the person's change again on top of the server's copy: what they changed wins, everything
 * else the other device did stays (`keepMineText`). When that cannot be done, nothing is sent: the
 * card stays, says why and offers only the server's version, and the reason is resolved here for
 * the caller to announce. A create, a delete, and a write queued before its base text was kept, are
 * sent whole. Does nothing for a stale id.
 */
export async function keepMineOf(id: string, now = new Date()): Promise<string | null> {
  const entry = find(id)
  if (!entry) return null
  const server = entry.conflict?.server
  const { href, listHref, ics, baseIcs } = entry.payload
  if (entry.kind !== `update` || !server || baseIcs === undefined) {
    await getOutbox().keepMine(entry)
    return null
  }
  const etag = server.etag ?? ``
  const theirs = parseTask({ href, etag, listHref, ics: server.ics })
  if (!theirs.success) return refuse(entry, KEEP_MINE_UNREADABLE)
  const kept = keepMineText(baseIcs, ics, theirs.output, now)
  if (!kept.success) return refuse(entry, keepMineMessage(kept.error))
  // One step in the queue: a card another tab already settled stores and sends nothing.
  await getOutbox().keepMine(entry, {
    href,
    listHref,
    ics: kept.output.ics,
    baseEtag: etag,
    baseIcs: server.ics,
  })
  return null
}

/** Drops the person's version and shows the server's. Does nothing for a stale id. */
export async function useTheirsOf(id: string): Promise<void> {
  const entry = find(id)
  if (entry) await getOutbox().useTheirs(entry)
}
