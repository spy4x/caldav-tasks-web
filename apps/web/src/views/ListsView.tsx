import { useLocation } from "wouter-preact"
import { ListsScreen } from "@ui/lists-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { toasts } from "../state/toasts.ts"
import { listPath } from "../routes.ts"

/** Lists, wired. */
export function ListsView() {
  const [, navigate] = useLocation()
  return (
    <ListsScreen
      lists={taskLists.value}
      loading={!calendarsLoaded.value}
      onOpen={(list) => navigate(listPath(list))}
      // Creating, renaming and deleting lists is the list-management issue's work.
      onNewList={() =>
        toasts.info({
          title: ``,
          body: `Creating lists is not available yet. Add one in your CalDAV app.`,
        })}
    />
  )
}
