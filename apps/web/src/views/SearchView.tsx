import { useNow } from "@spy4x/preact-signals/now"
import { useSignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import { useLocation, useSearch } from "wouter-preact"
import { useUrlFilters } from "@spy4x/preact-signals/use-url-filters"
import { SearchScreen } from "@ui/search-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { completeWithUndo } from "./task-actions.ts"

/** Search, wired. The query lives in the address (`?q=`), so a reload keeps the search. */
export function SearchView() {
  const [, navigate] = useLocation()
  const query = useSignal(new URLSearchParams(useSearch()).get(`q`) ?? ``)
  const now = useNow({ zone: browserZone() }).value
  const typed = useRef<string>()
  useUrlFilters({ q: { signal: query, urlParam: `q`, initialValue: `` } })
  // The `/` shortcut focuses the field the moment it is drawn, so a first letter can arrive before
  // the address sync above has run, and that sync sets the query back to the address. Keep it.
  useEffect(() => {
    if (typed.current !== undefined) query.value = typed.current
  }, [])
  return (
    <SearchScreen
      tasks={tasks.value}
      lists={taskLists.value}
      zone={browserZone()}
      now={now}
      loading={!calendarsLoaded.value}
      query={query.value}
      onQueryChange={(next) => query.value = typed.current = next}
      // On a phone the keyboard would cover the results.
      autoFocus={globalThis.matchMedia?.(`(min-width: 768px)`).matches ?? false}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
    />
  )
}
