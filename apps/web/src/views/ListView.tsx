import { useNow } from "@spy4x/preact-signals/now"
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { useLocation, useParams, useSearch } from "wouter-preact"
import { useUrlFilters } from "@spy4x/preact-signals/use-url-filters"
import { ListScreen } from "@ui/list-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { loadCompleted } from "../state/sync.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { findListBySlug, listSettingsPath, taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { sortFromParam, sortToParam, tagsFromParam, tagsToParam } from "./list-filters.ts"
import { NotFoundView } from "./NotFoundView.tsx"
import { completeWithUndo, reorderInList } from "./task-actions.ts"
import { useQuickAdd } from "./use-quick-add.ts"

/**
 * A list, wired. The sort and the tag filter live in the address (`?sort=due&tags=home`), so a
 * reload, a bookmark and the Back button keep them.
 */
export function ListView() {
  const { slug = `` } = useParams<{ slug: string }>()
  const [, navigate] = useLocation()
  const list = findListBySlug(taskLists.value, slug)
  const params = new URLSearchParams(useSearch())
  const sort = useSignal(params.get(`sort`) ?? ``)
  const tags = useSignal(params.get(`tags`) ?? ``)
  useUrlFilters({
    sort: { signal: sort, urlParam: `sort`, initialValue: `` },
    tags: { signal: tags, urlParam: `tags`, initialValue: `` },
  })
  const showCompleted = useSignal(false)
  const quickAdd = useQuickAdd({ listHref: list?.href })
  const listHref = list?.href
  const now = useNow({ zone: browserZone() }).value
  useEffect(() => {
    if (listHref && showCompleted.value) void loadCompleted(listHref)
  }, [listHref, showCompleted.value])

  const listTasks = tasks.value.filter((task) => task.listHref === list?.href)
  if (!list) return calendarsLoaded.value ? <NotFoundView /> : null
  return (
    <ListScreen
      list={list}
      tasks={listTasks}
      zone={browserZone()}
      now={now}
      loading={!calendarsLoaded.value}
      sort={sortFromParam(sort.value)}
      onSortChange={(mode) => sort.value = sortToParam(mode)}
      activeTags={tagsFromParam(tags.value)}
      onActiveTagsChange={(next) => tags.value = tagsToParam(next)}
      showCompleted={showCompleted.value}
      onShowCompletedChange={(show) => showCompleted.value = show}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
      onReorder={(task, siblings, to) =>
        void reorderInList(listTasks, task, siblings, to, browserZone())}
      onQuickAdd={(parsed) => void quickAdd.add(parsed)}
      quickAddBusy={quickAdd.busy.value}
      navigate={navigate}
      // Name, colour and delete share one settings page; Delete lives in its "More actions".
      onRename={() => navigate(listSettingsPath(list))}
      onChangeColor={() => navigate(listSettingsPath(list))}
    />
  )
}
