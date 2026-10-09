import { CALDAV_PATHS, calendarCreatedSchema } from "@api/caldav.ts"
import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { LIST_ADMIN_OFFLINE, type ListDraft, pickerColor } from "@ui/list-settings.tsx"
import { offline, relay, type RelayResult } from "./connection.ts"
import { refresh } from "./sync.ts"

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

/** Renames or recolours a list, sending only what changed; with no change it sends nothing. */
export function updateList(list: TaskList, draft: ListDraft): Promise<ListAdminResult> {
  const changes = {
    ...(draft.name === list.name ? {} : { displayName: draft.name }),
    ...(draft.color === pickerColor(list.color) ? {} : { color: draft.color }),
  }
  if (Object.keys(changes).length === 0) return Promise.resolve({ ok: true, value: undefined })
  return send(() =>
    relay<void>(CALDAV_PATHS.calendar, { method: `PATCH`, body: { href: list.href, ...changes } })
  )
}

/** Deletes a list and every task in it, on the server and in the cache. */
export function deleteList(list: TaskList): Promise<ListAdminResult> {
  return send(() =>
    relay<void>(CALDAV_PATHS.calendar, { method: `DELETE`, body: { href: list.href } })
  )
}
