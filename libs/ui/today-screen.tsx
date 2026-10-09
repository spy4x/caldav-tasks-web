import type { JSX } from "preact"
import { useState } from "preact/hooks"
import { IconChevronDown, IconSun } from "@spy4x/preact-icons"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { formatDateLong, isoDateInTz } from "@spy4x/time/tz"
import type { Task, TaskList } from "@spy4x/time/ical-tasks-model"
import type { QuickAddResult } from "@spy4x/platform"
import { QuickAdd } from "./quick-add.tsx"
import { FocusKeeper } from "./task-focus.tsx"
import { EmptyBody, GroupHeading, LoadingBody, ScreenLayout } from "./task-screen.tsx"
import { flatNodes, TaskTree } from "./task-tree.tsx"

/** Props of {@link TodayScreen}. */
export interface TodayScreenProps {
  /** Open tasks whose due value has passed, earliest first: `todayView(...).overdue`. */
  overdue: readonly Task[]
  /** Open tasks due later today, earliest first: `todayView(...).today`. */
  today: readonly Task[]
  /** Every list, so each row can show its list's colour and name. */
  lists: readonly TaskList[]
  zone: string
  now: Date
  /** The data is still on its way: a skeleton replaces the tasks. */
  loading?: boolean
  onComplete: (task: Task, done: boolean) => void
  onOpen: (task: Task) => void
  /** Creates a task due today in the default list. */
  onQuickAdd: (parsed: QuickAddResult) => void
  quickAddBusy?: boolean
}

/**
 * The home screen: overdue tasks above today's, across all lists, each row naming its list. The
 * overdue group can be folded away. Quick add creates a task due today.
 */
export function TodayScreen(props: TodayScreenProps): JSX.Element {
  const [overdueOpen, setOverdueOpen] = useState(true)
  const byHref = new Map(props.lists.map((list) => [list.href, list]))
  const listOf = (task: Task) => byHref.get(task.listHref)
  const empty = props.overdue.length === 0 && props.today.length === 0
  const common = {
    zone: props.zone,
    now: props.now,
    listOf,
    onComplete: props.onComplete,
    onOpen: props.onOpen,
  }

  return (
    <ScreenLayout
      header={
        <PageHeader
          title="Today"
          subtitle={formatDateLong(isoDateInTz(props.now, props.zone), props.zone)}
        />
      }
      quickAdd={
        <QuickAdd
          onAdd={props.onQuickAdd}
          zone={props.zone}
          busy={props.quickAddBusy}
          hint="Added to your default list, due today"
        />
      }
    >
      {props.loading ? <LoadingBody label="Loading today's tasks" /> : empty
        ? (
          <EmptyBody
            title="Nothing due today"
            description="Add a task in the field, or enjoy the quiet."
            icon={<IconSun class="size-5" />}
          />
        )
        : (
          <FocusKeeper label="Tasks" class="flex flex-col gap-6">
            {props.overdue.length > 0 && (
              <section aria-labelledby="today-overdue" class="flex flex-col gap-2">
                <GroupHeading id="today-overdue">
                  <button
                    type="button"
                    class="flex min-h-11 w-full cursor-pointer items-center gap-2 uppercase text-danger"
                    aria-expanded={overdueOpen}
                    onClick={() =>
                      setOverdueOpen(!overdueOpen)}
                    data-e2e="overdue-toggle"
                  >
                    <IconChevronDown
                      class={`size-4 transition-transform ${overdueOpen ? `` : `-rotate-90`}`}
                      aria-hidden="true"
                    />
                    <span>Overdue</span>
                    <span class="font-normal">{props.overdue.length}</span>
                  </button>
                </GroupHeading>
                {overdueOpen && (
                  <TaskTree label="Overdue" nodes={flatNodes(props.overdue)} {...common} />
                )}
              </section>
            )}
            {props.today.length > 0 && (
              <section aria-labelledby="today-due" class="flex flex-col gap-2">
                <GroupHeading id="today-due">Due today</GroupHeading>
                <TaskTree label="Due today" nodes={flatNodes(props.today)} {...common} />
              </section>
            )}
          </FocusKeeper>
        )}
    </ScreenLayout>
  )
}
