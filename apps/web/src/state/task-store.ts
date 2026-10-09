import { effect, signal } from "@preact/signals"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import { type CachedTask, cacheUnavailable, getStorage } from "./db.ts"
import { overlay, pendingEntries } from "./pending.ts"

/** The tasks as the server last had them: the cache, kept in step by every refresh and write. */
export const serverTasks = signal<Task[]>([])

/**
 * Every cached task of every list, parsed, with the writes still waiting in the outbox applied on
 * top. A resource that cannot be parsed is left out.
 */
export const tasks = signal<Task[]>([])

// Whatever changes the server's copy or the queue changes what the screens show.
effect(() => {
  tasks.value = overlay(serverTasks.value, pendingEntries.value)
})

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
  serverTasks.value = parsed
}

/** Stores `task` in the cache and swaps it into {@link serverTasks}. */
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
  const others = serverTasks.value.filter((other) => other.href !== task.href)
  serverTasks.value = [...others, task]
}

/** Drops the task at `href` from the cache and from {@link serverTasks}. */
export async function forget(href: string): Promise<void> {
  try {
    await getStorage().deleteTask(href)
  } catch {
    // The server has the delete already; a failing cache must not report it as lost.
    cacheUnavailable.value = true
  }
  serverTasks.value = serverTasks.value.filter((other) => other.href !== href)
}
