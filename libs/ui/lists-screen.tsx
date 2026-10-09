import type { JSX } from "preact"
import { IconList, IconPlus } from "@spy4x/preact-icons"
import { PageAction, PageHeader } from "@spy4x/preact-ui/page-header"
import type { TaskList } from "../tasks/types.ts"
import { EmptyBody, LoadingBody, ScreenLayout } from "./task-screen.tsx"

/** Props of {@link ListsScreen}. */
export interface ListsScreenProps {
  lists: readonly TaskList[]
  loading?: boolean
  onOpen: (list: TaskList) => void
  /** "New list", the screen's one filled action. */
  onNewList: () => void
}

/** Every task list with its colour, name and number of open tasks. */
export function ListsScreen(props: ListsScreenProps): JSX.Element {
  return (
    <ScreenLayout
      header={
        <PageHeader
          title="Lists"
          action={<PageAction label="New list" Icon={IconPlus} onClick={props.onNewList} />}
        />
      }
    >
      {props.loading ? <LoadingBody label="Loading lists" /> : props.lists.length === 0
        ? (
          <EmptyBody
            title="No lists yet"
            description="Create a list to start collecting tasks."
            icon={<IconList class="size-5" />}
          />
        )
        : (
          <ul aria-label="Lists" class="flex flex-col" data-e2e="lists">
            {props.lists.map((list) => (
              <li key={list.href} class="border-b border-subtle">
                <button
                  type="button"
                  class="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
                  onClick={() => props.onOpen(list)}
                  data-e2e="list-open"
                >
                  <span
                    class="size-3 shrink-0 rounded-full bg-track"
                    style={list.color ? { backgroundColor: list.color } : undefined}
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate text-base">{list.name}</span>
                  <span class="shrink-0 text-sm text-muted">
                    {list.openCount}
                    <span class="sr-only">
                      {list.openCount === 1 ? ` open task` : ` open tasks`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </ScreenLayout>
  )
}
