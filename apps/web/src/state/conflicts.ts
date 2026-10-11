import { computed } from "@preact/signals"
import { completeTask, keepMine, reopenTask, type TaskEdit } from "@spy4x/time/ical-tasks-edit"
import { parseTask, type Task, TaskStatus } from "@spy4x/time/ical-tasks-model"
import type { ConflictKind } from "@spy4x/preact-system/conflict-chooser"
import { getOutbox, requeueOn } from "./outbox.ts"
import { pendingEntries, type TaskEntry } from "./pending.ts"

/** A queued write the server did not take, as the screen lists it. */
export interface TaskConflictItem {
  /** The entry's `seq`, as text. */
  id: string
  /** The task's title, or its address when the text cannot be read. */
  label: string
  reason: ConflictKind
  message: string
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

/** Every write waiting for the person to choose, in the order they were made. */
export const conflicts = computed<TaskConflictItem[]>(() =>
  conflictEntries.value.map((entry) => ({
    id: String(entry.seq),
    label: titleOf(entry),
    reason: entry.conflict?.reason ?? `rejected`,
    message: entry.conflict?.message ?? ``,
  }))
)

function find(id: string): TaskEntry | undefined {
  return conflictEntries.value.find((entry) => String(entry.seq) === id)
}

const isDone = (task: Task) => task.status === TaskStatus.Completed

/**
 * Every field the editor can change, as `task` has it. `keepMine` from
 * `@spy4x/time/ical-tasks-edit` then keeps only the ones that differ from the base.
 */
function fieldsOf(task: Task): TaskEdit {
  return {
    title: task.title,
    notes: task.notes,
    due: task.due ?? null,
    start: task.start ?? null,
    priority: task.priority,
    tags: task.tags,
    sortOrder: task.sortOrder ?? null,
    repeatRule: task.repeatRule ?? null,
    reminders: task.reminders.map((reminder) => ({ trigger: reminder.alarm })),
  }
}

/**
 * The text "Keep mine" sends for a queued edit: the server's copy with only what the person
 * changed written over it, so what the other device did to other fields stays. `null` when that
 * cannot be worked out (a delete, a write queued without its base text, a text that does not
 * parse); the queued text is then sent whole.
 */
export function keptText(entry: TaskEntry, now: Date): string | null {
  const server = entry.conflict?.server
  const { href, listHref, ics, baseEtag, baseIcs } = entry.payload
  if (entry.kind !== `update` || !server || baseIcs === undefined) return null
  const base = parseTask({ href, etag: baseEtag, listHref, ics: baseIcs })
  const mine = parseTask({ href, etag: baseEtag, listHref, ics })
  const theirs = parseTask({ href, etag: server.etag ?? ``, listHref, ics: server.ics })
  if (!base.success || !mine.success || !theirs.success) return null
  const merged = keepMine(base.output, fieldsOf(mine.output), theirs.output, now)
  if (!merged.success) return null
  const done = isDone(mine.output)
  // Completing and reopening are not fields of an edit: the person's tick is made again.
  if (done === isDone(base.output) || done === isDone(merged.output.task)) return merged.output.ics
  const ticked = done ? completeTask(merged.output.task, now) : reopenTask(merged.output.task, now)
  return ticked.success ? ticked.output.ics : null
}

/**
 * Sends the person's change again on top of the server's copy: the fields they changed win, the
 * other device's other fields stay. Does nothing for a stale id.
 */
export async function keepMineOf(id: string, now = new Date()): Promise<void> {
  const entry = find(id)
  if (!entry) return
  const server = entry.conflict?.server
  const ics = keptText(entry, now)
  const kept = server && ics !== null ? await requeueOn(entry, server, ics) : entry
  if (kept) await getOutbox().keepMine(kept)
}

/** Drops the person's version and shows the server's. Does nothing for a stale id. */
export async function useTheirsOf(id: string): Promise<void> {
  const entry = find(id)
  if (entry) await getOutbox().useTheirs(entry)
}
