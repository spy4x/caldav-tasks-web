import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { useLocation, useParams } from "wouter-preact"
import { isTasksOnly } from "@api/caldav.ts"
import { ListSettingsScreen } from "@ui/list-settings.tsx"
import { calendars, calendarsLoaded } from "../state/calendars.ts"
import { offline } from "../state/connection.ts"
import { createList, deleteList, type ListAdminResult, updateList } from "../state/list-admin.ts"
import { loadCompleted } from "../state/sync.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { toasts } from "../state/toasts.ts"
import { findListBySlug, listPath, ROUTES } from "../routes.ts"
import { NotFoundView } from "./NotFoundView.tsx"

/**
 * A list's settings, wired; without a list in the address, a new list. List changes need the
 * server: offline the screen says so and sends nothing. The delete question counts the list's
 * completed tasks too: Delete waits until they are loaded, and when they cannot be, the question
 * names no number rather than a low one.
 */
/** Whether the delete question's count is still loading, complete, or could not be completed. */
type CountState = `loading` | `ready` | `unknown`

export function ListSettingsView() {
  const { slug } = useParams<{ slug?: string }>()
  const [, navigate] = useLocation()
  const saving = useSignal(false)
  const deleting = useSignal(false)
  const error = useSignal<string | null>(null)
  const list = slug === undefined ? undefined : findListBySlug(taskLists.value, slug)
  const listHref = list?.href
  const calendar = calendars.value.find((candidate) => candidate.href === listHref)
  // Which list the count belongs to, so another list's finished count is never shown.
  const count = useSignal<{ href?: string; state: CountState }>({ state: `loading` })
  const countState = count.value.href === listHref ? count.value.state : `loading`
  const isOffline = offline.value
  useEffect(() => {
    if (!listHref || isOffline) return
    let current = true
    void loadCompleted(listHref).then((loaded) => {
      if (current) count.value = { href: listHref, state: loaded ? `ready` : `unknown` }
    })
    return () => {
      current = false
    }
  }, [listHref, isOffline])

  if (slug !== undefined && !list) return calendarsLoaded.value ? <NotFoundView /> : null

  /** Runs one change while `busy` is set, and shows why it failed when it did. */
  async function run<T>(
    busy: typeof saving,
    change: () => Promise<ListAdminResult<T>>,
  ): Promise<ListAdminResult<T>> {
    busy.value = true
    error.value = null
    try {
      const result = await change()
      if (!result.ok) error.value = result.message
      return result
    } finally {
      busy.value = false
    }
  }

  return (
    <ListSettingsScreen
      // A new key per list, so the form starts again from the list it shows.
      key={listHref ?? `new`}
      list={list}
      taskCount={countState === `unknown`
        ? null
        : tasks.value.filter((task) => task.listHref === listHref).length}
      counting={countState === `loading`}
      holdsEvents={calendar ? !isTasksOnly(calendar.components) : false}
      offline={offline.value}
      saving={saving.value}
      deleting={deleting.value}
      error={error.value}
      backHref={list ? listPath(list) : ROUTES.lists}
      navigate={navigate}
      onSave={async (draft) => {
        if (!list) {
          const created = await run(saving, () => createList(draft))
          if (!created.ok) return
          toasts.success({ title: ``, body: `Created ${draft.name}` })
          navigate(listPath(created.value))
          return
        }
        if (!(await run(saving, () => updateList(list, draft))).ok) return
        toasts.success({ title: ``, body: `Saved` })
        // The address follows the list, which keeps its href when renamed.
        navigate(listPath(list))
      }}
      onDelete={list && (async () => {
        if (!(await run(deleting, () => deleteList(list))).ok) return
        toasts.success({ title: ``, body: `Deleted ${list.name}` })
        navigate(ROUTES.lists)
      })}
    />
  )
}
