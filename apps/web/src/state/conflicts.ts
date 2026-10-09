import { computed } from "@preact/signals"
import { parseTask } from "@spy4x/time/ical-tasks-model"
import type { ConflictKind } from "@spy4x/preact-system/conflict-chooser"
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

/** Sends the person's version again on top of the server's. Does nothing for a stale id. */
export async function keepMineOf(id: string): Promise<void> {
  const entry = find(id)
  if (entry) await getOutbox().keepMine(entry)
}

/** Drops the person's version and shows the server's. Does nothing for a stale id. */
export async function useTheirsOf(id: string): Promise<void> {
  const entry = find(id)
  if (entry) await getOutbox().useTheirs(entry)
}
