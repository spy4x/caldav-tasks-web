import { CALDAV_PATHS, calendarCreatedSchema } from "@api/caldav.ts"
import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { LIST_ADMIN_OFFLINE, type ListDraft, pickerColor } from "@ui/list-settings.tsx"
import { offline, relay, type RelayResult } from "./connection.ts"
import { renameMentions } from "@ui/mentions.tsx"
import { refresh } from "./sync.ts"
import { saveTask, tasks } from "./tasks.ts"
import { taskLists } from "./task-lists.ts"

/** The outcome of a list change: done, or why not, ready to show. */
export type ListAdminResult<T = void> = { ok: true; value: T } | { ok: false; message: string }

/**
 * Sends one list change, then refreshes the cache so every screen shows it. List changes go
 * straight to the server and are never queued: a list is a calendar on the CalDAV server, and a
 * queued create or delete could not be shown or undone honestly while offline.
 */
async function send<T>(run: () => Promise<RelayResult<T>>): Promise<ListAdminResult<T>> {
  if (offline.value) return { ok: false, message: LIST_ADMIN_OFFLINE }
  const result = await run()
  if (!result.ok) {
    return { ok: false, message: result.offline ? LIST_ADMIN_OFFLINE : result.message }
  }
  await refresh()
  return { ok: true, value: result.data }
}

/** Creates a list. Resolves with its href once the cache holds it. */
export function createList(draft: ListDraft): Promise<ListAdminResult<string>> {
  return send(async () => {
    const result = await relay(
      CALDAV_PATHS.calendars,
      { method: `POST`, body: { displayName: draft.name, color: draft.color } },
      calendarCreatedSchema,
    )
    return result.ok ? { ...result, data: result.data.href } : result
  })
}

/**
 * Renames or recolours a list, sending only what changed; with no change it sends nothing. A new
 * name is also written into every task that mentions the list as `@Name`, so its links still work.
 */
export async function updateList(list: TaskList, draft: ListDraft): Promise<ListAdminResult> {
  const changes = {
    ...(draft.name === list.name ? {} : { displayName: draft.name }),
    ...(draft.color === pickerColor(list.color) ? {} : { color: draft.color }),
  }
  if (Object.keys(changes).length === 0) return { ok: true, value: undefined }
  const names = taskLists.value.map((each) => each.name)
  const result = await send(() =>
    relay<void>(CALDAV_PATHS.calendar, { method: `PATCH`, body: { href: list.href, ...changes } })
  )
  if (result.ok && changes.displayName) void renameMentionsOf(list.name, draft.name, names)
  return result
}

/**
 * Rewrites `@from` as `@to` in each task that mentions it, one task at a time. The writes go
 * through the task queue like any edit; one that fails leaves that task's old mention.
 */
async function renameMentionsOf(from: string, to: string, names: string[]): Promise<void> {
  for (const task of tasks.value) {
    const title = renameMentions(task.title, from, to, names)
    const notes = renameMentions(task.notes, from, to, names)
    if (title === task.title && notes === task.notes) continue
    await saveTask(task, {
      ...(title === task.title ? {} : { title }),
      ...(notes === task.notes ? {} : { notes }),
    })
  }
}

/** Deletes a list and every task in it, on the server and in the cache. */
export function deleteList(list: TaskList): Promise<ListAdminResult> {
  return send(() =>
    relay<void>(CALDAV_PATHS.calendar, { method: `DELETE`, body: { href: list.href } })
  )
}
