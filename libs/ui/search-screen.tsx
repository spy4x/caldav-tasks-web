import type { JSX } from "preact"
import { IconLens } from "@spy4x/preact-icons"
import { Input } from "@spy4x/preact-ui/input"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { searchTasks } from "../tasks/search.ts"
import type { Task, TaskList } from "../tasks/types.ts"
import { FocusKeeper } from "./task-focus.tsx"
import { EmptyBody, GroupHeading, LoadingBody, ScreenLayout } from "./task-screen.tsx"
import { flatNodes, TaskTree } from "./task-tree.tsx"

/** Props of {@link SearchScreen}. */
export interface SearchScreenProps {
  /** Every task in the local cache. The screen searches them, so results are instant. */
  tasks: readonly Task[]
  /** The lists, in the order the results are grouped. */
  lists: readonly TaskList[]
  zone: string
  now: Date
  loading?: boolean
  query: string
  onQueryChange: (query: string) => void
  /** Puts the cursor in the field on arrival; leave it off on a phone, where it opens the keyboard. */
  autoFocus?: boolean
  onComplete: (task: Task, done: boolean) => void
  onOpen: (task: Task) => void
}

/** One field and the matching tasks across all lists, grouped by list. */
export function SearchScreen(props: SearchScreenProps): JSX.Element {
  const results = searchTasks(props.tasks, props.query)
  const groups = props.lists
    .map((list) => ({ list, tasks: results.filter((task) => task.listHref === list.href) }))
    .filter((group) => group.tasks.length > 0)
  const searching = props.query.trim() !== ``

  return (
    <ScreenLayout header={<PageHeader title="Search" />}>
      <div class="flex flex-col gap-4">
        <Input
          type="search"
          name="q"
          aria-label="Search tasks"
          placeholder="Search titles, notes and tags"
          autocomplete="off"
          autoFocus={props.autoFocus}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          class="min-h-11"
          data-e2e="search-input"
        />
        <div role="status" class="sr-only" data-e2e="search-count">
          {searching && !props.loading &&
            `${results.length} ${results.length === 1 ? `result` : `results`}`}
        </div>
        {props.loading ? <LoadingBody label="Loading tasks" /> : !searching
          ? (
            <EmptyBody
              title="Search your tasks"
              description="Type a word from a title, a note or a tag."
              icon={<IconLens class="size-5" />}
            />
          )
          : results.length === 0
          ? (
            <EmptyBody
              title="No tasks match"
              description={`Nothing matches “${props.query.trim()}”.`}
              icon={<IconLens class="size-5" />}
            />
          )
          : (
            <FocusKeeper label="Results" class="flex flex-col gap-6">
              {groups.map(({ list, tasks }) => (
                <section
                  key={list.href}
                  aria-labelledby={`search-${list.href}`}
                  class="flex flex-col gap-2"
                >
                  <GroupHeading id={`search-${list.href}`}>
                    <span class="inline-flex items-center gap-2">
                      <span
                        class="size-2 shrink-0 rounded-full bg-track"
                        style={list.color ? { backgroundColor: list.color } : undefined}
                        aria-hidden="true"
                      />
                      {list.name}
                    </span>
                  </GroupHeading>
                  <TaskTree
                    label={list.name}
                    nodes={flatNodes(tasks)}
                    zone={props.zone}
                    now={props.now}
                    onComplete={props.onComplete}
                    onOpen={props.onOpen}
                  />
                </section>
              ))}
            </FocusKeeper>
          )}
      </div>
    </ScreenLayout>
  )
}
