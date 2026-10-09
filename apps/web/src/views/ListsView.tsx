import { useLocation } from "wouter-preact"
import { ListsScreen } from "@ui/lists-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { listPath, ROUTES } from "../routes.ts"

/** Lists, wired. */
export function ListsView() {
  const [, navigate] = useLocation()
  return (
    <ListsScreen
      lists={taskLists.value}
      loading={!calendarsLoaded.value}
      onOpen={(list) => navigate(listPath(list))}
      onNewList={() => navigate(ROUTES.newList)}
    />
  )
}
