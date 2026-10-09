import { useSignal } from "@preact/signals"
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
  useUrlFilters({ q: { signal: query, urlParam: `q`, initialValue: `` } })
  return (
    <SearchScreen
      tasks={tasks.value}
      lists={taskLists.value}
      zone={browserZone()}
      now={new Date()}
      loading={!calendarsLoaded.value}
      query={query.value}
      onQueryChange={(next) => query.value = next}
      // On a phone the keyboard would cover the results.
      autoFocus={globalThis.matchMedia?.(`(min-width: 768px)`).matches ?? false}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
    />
  )
}
