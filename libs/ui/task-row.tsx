import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { IconArrowPath, IconBell, IconChevronDown, IconFlag } from "@spy4x/preact-icons"
import { Checkbox } from "@spy4x/preact-ui/checkbox"
import { dueLabel, DueTone } from "./due-label.ts"
import {
  isOpen,
  PriorityBand,
  priorityBand,
  type Task,
  type TaskList,
} from "@spy4x/time/ical-tasks-model"

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
  /** How many of those are done, for "1 of 3 subtasks". */
  doneSubtaskCount?: number
  /** Whether the subtasks are shown. Only read when `subtaskCount` is greater than zero. */
  expanded?: boolean
  onExpandedChange?: (task: Task, expanded: boolean) => void
  /** The check was pressed: `done` is the state it asks for. */
  onComplete: (task: Task, done: boolean) => void
  /** The row (not its check) was pressed. */
  onOpen: (task: Task) => void
  /** Draws a `div` instead of an `li`, for a row that sits inside another list's item. */
  bare?: boolean
  /** A quiet row with no line above it and no "No date", as in the Completed section. */
  plain?: boolean
  /**
   * Given, pressing the title renames the task in place (Enter or leaving the field saves, Escape
   * cancels) and an "Edit" button, shown on hover, opens it with `onOpen`.
   */
  onRename?: (task: Task, title: string) => void
  /**
   * Given, Enter while renaming opens a new line under the row: a title typed there and Enter
   * creates a task beside this one (a subtask of the same parent), and opens the next line.
   */
  onAddSibling?: (task: Task, title: string) => void
  /** Given, a "Delete" button shows on hover, right of "Edit". */
  onDelete?: (task: Task) => void
  /** A drag handle, drawn at the right end of the row. */
  handle?: JSX.Element
  /** This row is the one being dragged. */
  lifted?: boolean
  /** A dragged task would go under this row. */
  dropInto?: boolean
}

const INDENT = [`ps-2`, `ps-12`, `ps-16`, `ps-16`] as const
const MAX_TAGS = 3

const TONE_CLASS: Record<DueTone, string> = {
  [DueTone.Normal]: `text-muted`,
  [DueTone.Today]: `text-warning font-medium`,
  [DueTone.Overdue]: `text-danger font-medium`,
}

const FLAG: Record<PriorityBand, { label: string; class: string } | undefined> = {
  [PriorityBand.None]: undefined,
  [PriorityBand.Low]: { label: `Low priority`, class: `text-info` },
  [PriorityBand.Medium]: { label: `Medium priority`, class: `text-warning` },
  [PriorityBand.High]: { label: `High priority`, class: `text-danger` },
}

/**
 * One task as a single line: a round check, the title, then on the right the subtask count (which
 * shows and hides them), list, priority flag, tags as chips, repeat and reminder marks and the due
 * date. Subtasks are indented under their parent with no line between them.
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
  const sub = depth > 0
  const quiet = sub || props.plain
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const newLine = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (adding) newLine.current?.focus()
  }, [adding])
  const field = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    if (!renaming) return
    finished.current = false
    field.current?.focus()
    field.current?.select()
  }, [renaming])
  const finishRename = (value: string | null, next = false) => {
    if (finished.current) return
    finished.current = true
    setRenaming(false)
    const title = value?.trim()
    if (title && title !== task.title) props.onRename?.(task, title)
    if (next && props.onAddSibling) setAdding(true)
  }
  /** Creates the task typed on the new line; `keepOpen` leaves an empty line for the next one. */
  const addFromNewLine = (input: HTMLInputElement, keepOpen: boolean) => {
    const title = input.value.trim()
    if (title) props.onAddSibling?.(task, title)
    input.value = ``
    if (!title || !keepOpen) setAdding(false)
  }

  const setExpanded = (next: boolean) => props.onExpandedChange?.(task, next)
  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLLIElement>) => {
    if (!expandable || event.altKey || event.ctrlKey || event.metaKey || renaming) return
    if (event.key === `ArrowRight` && !expanded) {
      event.preventDefault()
      setExpanded(true)
    } else if (event.key === `ArrowLeft` && expanded) {
      event.preventDefault()
      setExpanded(false)
    }
  }

  const Tag = (props.bare ? `div` : `li`) as `li`
  return (
    <Tag
      class={`isolate relative flex flex-wrap items-center gap-x-2 pe-4 @max-xl:gap-x-1 ${
        INDENT[Math.min(depth, 3)]
      } ${
        sub
          ? `min-h-8`
          : props.plain
          ? `min-h-9`
          : `min-h-11 border-t border-subtle first:border-t-0`
      } ${props.lifted ? `task-lifted` : ``} ${props.dropInto ? `task-drop-target` : ``}`}
      data-e2e="task-row"
      data-task-uid={task.uid}
      onKeyDown={onKeyDown}
    >
      <Checkbox
        checked={!open}
        aria-label={`Complete ${task.title}`}
        shape="round"
        labelClass={`relative z-10 min-w-11 shrink-0 justify-center ${
          quiet ? `min-h-8` : `min-h-11`
        }`}
        data-task-check={task.uid}
        data-e2e="task-check"
        onChange={(event) =>
          props.onComplete(task, (event.currentTarget as HTMLInputElement).checked)}
      />
      <div class={`min-w-0 flex-1 @max-xl:pe-4 ${quiet ? `py-1` : `py-2`}`}>
        {renaming
          ? (
            <input
              ref={field}
              class={`-ms-2 w-full rounded-md border border-accent bg-surface px-2 outline-none ${
                quiet ? `text-sm` : `text-[15px]`
              }`}
              defaultValue={task.title}
              aria-label={`Rename ${task.title}`}
              onKeyDown={(event) => {
                if (event.key === `Enter`) {
                  event.preventDefault()
                  finishRename(event.currentTarget.value, true)
                } else if (event.key === `Escape`) {
                  event.preventDefault()
                  finishRename(null)
                }
              }}
              onBlur={(event) => finishRename(event.currentTarget.value)}
              data-e2e="task-rename"
            />
          )
          : (
            <button
              type="button"
              class={`block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] ${
                props.onRename ? `cursor-text` : `after:absolute after:inset-0 after:content-['']`
              } ${quiet ? `text-sm` : `text-[15px]`}`}
              onClick={() => props.onRename ? setRenaming(true) : props.onOpen(task)}
              data-e2e="task-open"
            >
              <span class={`break-words ${open ? `` : `text-muted line-through`}`}>
                {task.title}
              </span>
            </button>
          )}
      </div>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] text-muted empty:hidden @max-xl:basis-full @max-xl:justify-start @max-xl:ps-12 @max-xl:pb-2">
        {expandable && (
          <button
            type="button"
            class="relative z-10 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-1 text-[13px] text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
            aria-expanded={expanded}
            aria-label={`${expanded ? `Hide` : `Show`} ${subtaskCount} ${
              subtaskCount === 1 ? `subtask` : `subtasks`
            } of ${task.title}`}
            onClick={() => setExpanded(!expanded)}
            data-e2e="task-expand"
          >
            <span aria-hidden="true">
              {props.doneSubtaskCount !== undefined
                ? `${props.doneSubtaskCount} of ${subtaskCount} ${
                  subtaskCount === 1 ? `subtask` : `subtasks`
                }`
                : subtaskCount}
            </span>
            <IconChevronDown
              class={`size-3 transition-transform ${expanded ? `` : `-rotate-90`}`}
              aria-hidden="true"
            />
          </button>
        )}
        {list && (
          <span class="inline-flex min-w-0 items-center gap-1">
            <span
              class="size-2 shrink-0 rounded-full bg-track"
              style={list.color ? { backgroundColor: list.color } : undefined}
              aria-hidden="true"
            />
            <span class="max-w-32 truncate">{list.name}</span>
          </span>
        )}
        {flag && (
          <span class={`inline-flex items-center ${flag.class}`}>
            <IconFlag class="size-4" aria-hidden="true" />
            <span class="sr-only">{flag.label}</span>
          </span>
        )}
        {shownTags.map((tag) => (
          <span key={tag} class="rounded bg-chip px-2 py-px text-xs">
            <span class="sr-only">#</span>
            {tag}
          </span>
        ))}
        {hiddenTags > 0 && <span class="text-xs">+{hiddenTags}</span>}
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
        {(props.onRename || props.onDelete) && (
          // Narrower than 48rem, Edit and Delete take no room: they show over the row on hover.
          <span class="row-edit relative z-10 inline-flex items-center gap-1 @max-3xl:absolute @max-3xl:end-12 @max-3xl:top-1 @max-3xl:z-20 @max-3xl:rounded-md @max-3xl:bg-surface @max-3xl:shadow-sm">
            {props.onRename && (
              <button
                type="button"
                class="relative z-10 inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[13px] text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
                aria-label={`Edit ${task.title}`}
                onClick={() => props.onOpen(task)}
                data-e2e="task-edit"
              >
                Edit
              </button>
            )}
            {props.onDelete && (
              <button
                type="button"
                class="relative z-10 inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[13px] text-danger/80 hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
                aria-label={`Delete ${task.title}`}
                onClick={() => props.onDelete?.(task)}
                data-e2e="task-row-delete"
              >
                Delete
              </button>
            )}
          </span>
        )}
        {(due || !quiet) && (
          <span
            class={`min-w-20 text-right @max-xl:min-w-0 ${
              due ? TONE_CLASS[due.tone] : `text-muted`
            }`}
            data-e2e={due ? `task-due` : undefined}
          >
            {due ? due.text : `No date`}
          </span>
        )}
      </div>
      {props.handle && (
        // Narrow, the handle keeps to the right of the title, off the details line.
        <span class="ms-2 @max-xl:absolute @max-xl:end-2 @max-xl:top-2 @max-xl:ms-0">
          {props.handle}
        </span>
      )}
      {adding && (
        <div class="relative z-10 basis-full ps-12 pb-3">
          <input
            ref={newLine}
            class={`w-full rounded-md border border-accent bg-surface px-2 outline-none ${
              quiet ? `text-sm` : `text-[15px]`
            }`}
            placeholder={sub ? `New subtask` : `New task`}
            aria-label={sub ? `New subtask under the same task` : `New task`}
            onKeyDown={(event) => {
              if (event.key === `Enter`) {
                event.preventDefault()
                addFromNewLine(event.currentTarget, true)
              } else if (event.key === `Escape`) {
                event.preventDefault()
                event.currentTarget.value = ``
                setAdding(false)
              }
            }}
            onBlur={(event) => addFromNewLine(event.currentTarget, false)}
            data-e2e="task-new-line"
          />
        </div>
      )}
    </Tag>
  )
}
