import type { JSX } from "preact"
import { IconCalendarDays } from "@spy4x/preact-icons"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { isoDateInTz } from "@spy4x/time/tz"
import type { Task, TaskList } from "../tasks/types.ts"
import { UPCOMING_DAYS, type UpcomingDay } from "../tasks/views.ts"
import { dayLabel } from "./due-label.ts"
import { FocusKeeper } from "./task-focus.tsx"
import { EmptyBody, GroupHeading, LoadingBody, ScreenLayout } from "./task-screen.tsx"
import { flatNodes, TaskTree } from "./task-tree.tsx"

/** Props of {@link UpcomingScreen}. */
export interface UpcomingScreenProps {
  /** One entry per day that has tasks, in date order: `upcomingView(...)`. */
  days: readonly UpcomingDay[]
  /** Every list, so each row can show its list's colour and name. */
  lists: readonly TaskList[]
  zone: string
  now: Date
  loading?: boolean
  onComplete: (task: Task, done: boolean) => void
  onOpen: (task: Task) => void
}

/** The next two weeks, one heading per day ("Tomorrow", "Thu 15 Oct") with its tasks under it. */
export function UpcomingScreen(props: UpcomingScreenProps): JSX.Element {
  const byHref = new Map(props.lists.map((list) => [list.href, list]))
  const today = isoDateInTz(props.now, props.zone)

  return (
    <ScreenLayout
      header={<PageHeader title="Upcoming" subtitle={`The next ${UPCOMING_DAYS} days`} />}
    >
      {props.loading
        ? <LoadingBody label="Loading upcoming tasks" />
        : props.days.length === 0
        ? (
          <EmptyBody
            title="Nothing coming up"
            description={`No task is due in the next ${UPCOMING_DAYS} days.`}
            icon={<IconCalendarDays class="size-5" />}
          />
        )
        : (
          <FocusKeeper label="Tasks" class="flex flex-col gap-6">
            {props.days.map((day) => {
              const heading = dayLabel(day.date, today, props.zone)
              return (
                <section
                  key={day.date}
                  aria-labelledby={`upcoming-${day.date}`}
                  class="flex flex-col gap-2"
                >
                  <GroupHeading id={`upcoming-${day.date}`}>{heading}</GroupHeading>
                  <TaskTree
                    label={heading}
                    nodes={flatNodes(day.tasks)}
                    zone={props.zone}
                    now={props.now}
                    listOf={(task) => byHref.get(task.listHref)}
                    onComplete={props.onComplete}
                    onOpen={props.onOpen}
                  />
                </section>
              )
            })}
          </FocusKeeper>
        )}
    </ScreenLayout>
  )
}
