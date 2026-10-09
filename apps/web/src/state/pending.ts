import { signal } from "@preact/signals"
import type { OutboxEntry } from "@spy4x/realtime/outbox"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"

/** What the person wrote in a queued write. */
export interface TaskPayload {
  /** Where the task lives, or will live once a queued create is sent. */
  href: string
  listHref: string
  /** The iCalendar text of the write; for a delete, the text the task had. */
  ics: string
  /** The etag of the server copy the text was made from; empty for a task created offline. */
  baseEtag: string
}

/** The server's copy of a task, as the outbox keeps it. `version` moves with the etag. */
export interface TaskSnapshot {
  version: number
  href: string
  listHref: string
  etag: string | null
  ics: string
}

/** One queued write. */
export type TaskEntry = OutboxEntry<TaskPayload, TaskSnapshot>

/** The queue as of its last change. */
export const pendingEntries = signal<readonly TaskEntry[]>([])

/**
 * A number for an etag, because the outbox compares versions as numbers and CalDAV's are strings.
 * Equal etags give equal numbers; two different etags meeting is a 1 in 4 billion chance and
 * would at worst show a conflict that is not one.
 */
export function versionOf(etag: string | null): number {
  const text = etag ?? ``
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The queued write that concerns the task at `href`, if any. */
export function entryFor(href: string, entries: readonly TaskEntry[]): TaskEntry | undefined {
  return entries.find((entry) => entry.payload.href === href)
}

/**
 * What the screens show: the server's tasks with every queued write applied on top, so a change
 * made offline is visible at once. A write waiting for a choice still shows what the person wrote.
 * A queued delete hides its task.
 */
export function overlay(server: readonly Task[], entries: readonly TaskEntry[]): Task[] {
  if (entries.length === 0) return [...server]
  const byHref = new Map(server.map((task) => [task.href, task]))
  for (const entry of entries) {
    const { href, listHref, ics } = entry.payload
    const base = byHref.get(href)
    if (entry.kind === `delete`) {
      byHref.delete(href)
      continue
    }
    const parsed = parseTask({ href, etag: base?.etag ?? ``, listHref, ics })
    if (parsed.success) byHref.set(href, parsed.output)
  }
  return [...byHref.values()]
}
