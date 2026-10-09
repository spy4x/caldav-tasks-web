import type { JSX } from "preact"
import { IconArrowPath, IconBell, IconChevronRight, IconFlag } from "@spy4x/preact-icons"
import { Checkbox } from "@spy4x/preact-ui/checkbox"
import { dueLabel, DueTone } from "./due-label.ts"
import { isOpen, priorityBand } from "../tasks/model.ts"
import { PriorityBand, type Task, type TaskList } from "../tasks/types.ts"

/** The list a row names in its meta line: a colour dot and the name. */
export type RowList = Pick<TaskList, "name" | "color">

/** Props of {@link TaskRow}. */
export interface TaskRowProps {
  task: Task
  /** The viewer's IANA time zone. Days and times are counted in it. */
  zone: string
  /** The current moment, passed in so the row never reads the clock. */
  now: Date
  /** How deep the task sits under its parents. Indents the row, up to three levels. */
  depth?: number
  /** Shown in the meta line, for views that mix lists. */
  list?: RowList
  /** How many subtasks are listed under the row. Greater than zero adds the expander. */
  subtaskCount?: number
  /** Whether the subtasks are shown. Only read when `subtaskCount` is greater than zero. */
  expanded?: boolean
  onExpandedChange?: (task: Task, expanded: boolean) => void
  /** The check was pressed: `done` is the state it asks for. */
  onComplete: (task: Task, done: boolean) => void
  /** The row (not its check) was pressed. */
  onOpen: (task: Task) => void
}

const INDENT = [`ps-0`, `ps-6`, `ps-12`, `ps-16`] as const
const MAX_TAGS = 3

const TONE_CLASS: Record<DueTone, string> = {
  [DueTone.Normal]: `text-muted`,
  [DueTone.Today]: `text-accent-text font-medium`,
  [DueTone.Overdue]: `text-danger font-medium`,
}

const FLAG: Record<PriorityBand, { label: string; class: string } | undefined> = {
  [PriorityBand.None]: undefined,
  [PriorityBand.Low]: { label: `Low priority`, class: `text-info` },
  [PriorityBand.Medium]: { label: `Medium priority`, class: `text-accent-text` },
  [PriorityBand.High]: { label: `High priority`, class: `text-danger` },
}

/**
 * One task as a dense, tappable row: a round check on the left, the title, then one quiet line of
 * meta (due, list, tags, priority flag, repeat and reminder marks), and the expander for subtasks
 * on the right.
 *
 * The check is a real checkbox named "Complete <title>". The title is a button that opens the
 * task; its hit area stretches over the whole row, under the check and the expander. Right Arrow
 * on the row opens its subtasks and Left Arrow closes them, as in a tree.
 */
export function TaskRow(props: TaskRowProps): JSX.Element {
  const { task, zone, now, depth = 0, list, subtaskCount = 0, expanded = false } = props
  const open = isOpen(task)
  const shownDue = task.due ? dueLabel(task.due, now, zone) : undefined
  // A finished task is never late: keep the date, drop the alarm colour.
  const due = shownDue && !open ? { ...shownDue, tone: DueTone.Normal } : shownDue
  const flag = FLAG[priorityBand(task.priority)]
  const shownTags = task.tags.slice(0, MAX_TAGS)
  const hiddenTags = task.tags.length - shownTags.length
  const expandable = subtaskCount > 0

  const setExpanded = (next: boolean) => props.onExpandedChange?.(task, next)
  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLLIElement>) => {
    if (!expandable || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === `ArrowRight` && !expanded) {
      event.preventDefault()
      setExpanded(true)
    } else if (event.key === `ArrowLeft` && expanded) {
      event.preventDefault()
      setExpanded(false)
    }
  }

  return (
    <li
      class={`isolate relative flex items-start gap-1 border-b border-subtle ${
        INDENT[Math.min(depth, 3)]
      }`}
      data-e2e="task-row"
      data-task-uid={task.uid}
      onKeyDown={onKeyDown}
    >
      <Checkbox
        checked={!open}
        aria-label={`Complete ${task.title}`}
        shape="round"
        labelClass="relative z-10 min-h-11 min-w-11 shrink-0 justify-center"
        data-task-check={task.uid}
        data-e2e="task-check"
        onChange={(event) =>
          props.onComplete(task, (event.currentTarget as HTMLInputElement).checked)}
      />
      <div class="min-w-0 flex-1 py-2">
        <button
          type="button"
          class="block w-full cursor-pointer text-left text-base after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
          onClick={() => props.onOpen(task)}
          data-e2e="task-open"
        >
          <span class={`break-words ${open ? `` : `line-through opacity-60`}`}>{task.title}</span>
        </button>
        <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {due && <span class={TONE_CLASS[due.tone]} data-e2e="task-due">{due.text}</span>}
          {list && (
            <span class="inline-flex min-w-0 items-center gap-1">
              <span
                class="size-2 shrink-0 rounded-full bg-track"
                style={list.color ? { backgroundColor: list.color } : undefined}
                aria-hidden="true"
              />
              <span class="truncate">{list.name}</span>
            </span>
          )}
          {shownTags.map((tag) => <span key={tag}>#{tag}</span>)}
          {hiddenTags > 0 && <span>+{hiddenTags}</span>}
          {flag && (
            <span class={`inline-flex items-center ${flag.class}`}>
              <IconFlag class="size-4" aria-hidden="true" />
              <span class="sr-only">{flag.label}</span>
            </span>
          )}
          {task.repeatRule !== undefined && (
            <span class="inline-flex items-center">
              <IconArrowPath class="size-4" aria-hidden="true" />
              <span class="sr-only">Repeats</span>
            </span>
          )}
          {task.reminders.length > 0 && (
            <span class="inline-flex items-center">
              <IconBell class="size-4" aria-hidden="true" />
              <span class="sr-only">Has a reminder</span>
            </span>
          )}
        </p>
      </div>
      {expandable && (
        <button
          type="button"
          class="relative z-10 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md text-sm text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
          aria-expanded={expanded}
          aria-label={`${expanded ? `Hide` : `Show`} ${subtaskCount} ${
            subtaskCount === 1 ? `subtask` : `subtasks`
          } of ${task.title}`}
          onClick={() => setExpanded(!expanded)}
          data-e2e="task-expand"
        >
          <span aria-hidden="true">{subtaskCount}</span>
          <IconChevronRight
            class={`size-4 transition-transform ${expanded ? `rotate-90` : ``}`}
            aria-hidden="true"
          />
        </button>
      )}
    </li>
  )
}
