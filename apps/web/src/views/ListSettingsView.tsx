import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { useLocation, useParams } from "wouter-preact"
import { ListSettingsScreen } from "@ui/list-settings.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
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
 * completed tasks too, so they are loaded first.
 */
export function ListSettingsView() {
  const { slug } = useParams<{ slug?: string }>()
  const [, navigate] = useLocation()
  const saving = useSignal(false)
  const deleting = useSignal(false)
  const error = useSignal<string | null>(null)
  const list = slug === undefined ? undefined : findListBySlug(taskLists.value, slug)
  const listHref = list?.href
  useEffect(() => {
    if (listHref && !offline.value) void loadCompleted(listHref)
  }, [listHref])

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
      taskCount={list ? tasks.value.filter((task) => task.listHref === list.href).length : 0}
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
