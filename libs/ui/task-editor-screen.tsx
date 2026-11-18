import type { JSX } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { hhmmInTz, isoDateInTz, resolveWallClock } from "@spy4x/time/tz"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { EnhancedForm } from "@spy4x/preact-ui/enhanced-form"
import { Field } from "@spy4x/preact-ui/field"
import { Input } from "@spy4x/preact-ui/input"
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFlag,
  IconTrashBin,
} from "@spy4x/preact-icons"
import { Link } from "@spy4x/preact-ui/link"
import { RadioGroup } from "@spy4x/preact-ui/radio"
import { TagInput } from "@spy4x/preact-ui/tag-input"
import { type LeaveGuard, UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { IcalDateKind } from "@spy4x/time/ical"
import { type AlarmInput } from "@spy4x/time/ical-tasks"
import { floatingDue } from "./due-label.ts"
import {
  PriorityBand,
  RepeatFrom,
  type Task,
  type TaskDate,
  type TaskList,
  TaskStatus,
} from "@spy4x/time/ical-tasks-model"
import { ConflictDialog } from "./conflict-dialog.tsx"
import { type MentionList, useMentions } from "./mentions.tsx"
import { RemindersField } from "./reminders-field.tsx"
import { repeatAnchor, RepeatField } from "./repeat-field.tsx"

/** What the editor hands back on Save: every field it shows, not only the ones that changed. */
export interface TaskDraft {
  title: string
  notes: string
  /** `null` when the task has no due date. Unchanged, it is the task's own value, untouched. */
  due: TaskDate | null
  /** `null` when the task has no start date. Unchanged, it is the task's own value, untouched. */
  start: TaskDate | null
  /** The iCalendar `PRIORITY`: 0, 9, 5 or 1 once picked; an untouched priority keeps its number. */
  priority: number
  /** The `href` of the list the task belongs to. */
  listHref: string
  tags: string[]
  /** The `RRULE` value (no prefix), or `null` for no repeat. Unchanged, it is the task's own text. */
  repeatRule: string | null
  /**
   * What a repeating task counts its next date from when it is completed: its due date, or the day
   * it was completed. `RepeatFrom.DueDate` when the task does not repeat.
   */
  repeatFrom: RepeatFrom
  /** The reminders the task has afterwards. Unchanged, they are the ones it was read with. */
  reminders: AlarmInput[]
}

/** Why a save was refused, by field. The screen adds its own checks for the title and the dates. */
export interface TaskEditorErrors {
  title?: string
  due?: string
  start?: string
  repeat?: string
  /** Something no single field explains, such as a network failure. */
  form?: string
}

/** Props of {@link TaskEditorScreen}. */
export interface TaskEditorScreenProps {
  /**
   * The task as stored. A new `etag` resets the form, unless it would drop something typed: then
   * the form stays on the version it started from until a save or "Use theirs".
   */
  task: Task
  /** The lists `@` offers in the title and the notes, to mention one. */
  mentionLists?: readonly MentionList[]
  /** Every list, for the list choice. */
  lists: readonly TaskList[]
  /** Tags used elsewhere, offered while typing. */
  tagSuggestions?: readonly string[]
  /** The task's direct subtasks. */
  subtasks?: readonly Task[]
  /** Where a subtask opens, to make its title a link. */
  subtaskHref?: (subtask: Task) => string
  /**
   * How many tasks a delete takes with this one: its subtasks and theirs, however deep, the
   * completed ones included. The delete question says the number. Left out or 0, it asks about
   * the task alone.
   */
  subtaskCount?: number
  /**
   * Called with the whole form when it is valid and Save is pressed. Never while `saving`. `base`
   * is the version the form started from, which is older than `task` when the stored task changed
   * while the form held something typed: the save must be made against `base`, so the change made
   * elsewhere is merged or reported as a conflict, never overwritten unseen.
   */
  onSave: (draft: TaskDraft, base: Task) => void
  /** A save is running: the form is disabled and Save shows its wait. */
  saving?: boolean
  /** Why the last save was refused. */
  errors?: TaskEditorErrors
  /** A save collided with an edit made elsewhere: shows the conflict dialog. */
  conflict?: boolean
  /** "Keep mine": called with the form as it stands, to save it over the other version. */
  onKeepMine?: (draft: TaskDraft) => void
  /** "Use theirs": the form has already been reset to the current `task`. */
  onUseTheirs?: () => void
  /**
   * The IANA zone the person reads times in, such as the browser's. A UTC time (`...Z`) is shown
   * and edited in this zone and written back as UTC. Floating and zoned times stay as written.
   * Defaults to `UTC`, which shows a UTC time as it is.
   */
  timeZone?: string
  /** Called with the title of a new subtask. */
  onAddSubtask?: (title: string) => void
  /** Called after the delete is confirmed. Without it there is no "Delete" in the menu. */
  onDelete?: () => void
  /**
   * "Delete task" was chosen and the question is opening: the moment to look up subtasks the page
   * does not have yet, so {@link TaskEditorScreenProps.subtaskCount} is right.
   */
  onDeleteAsked?: () => void
  /** A delete is running. */
  deleting?: boolean
  /** Moves the app's router to an address: Back, Cancel, subtasks, and leaving past the guard. */
  navigate: (href: string) => void
  /** Whether the router handles an address, for the guard. Defaults to every address. */
  owns?: (url: URL) => boolean
  /**
   * The guard the app's code-started navigations (sidebar, shortcuts) go through, so they ask
   * before leaving with unsaved changes too.
   */
  leaveGuard?: LeaveGuard
  /** Where Back and Cancel go. Defaults to `/`. */
  backHref?: string
}

/** The form's values as the inputs hold them. */
interface Fields {
  title: string
  notes: string
  dueDate: string
  dueTime: string
  startDate: string
  startTime: string
  priority: number
  listHref: string
  tags: string[]
  repeatRule: string | null
  repeatFrom: RepeatFrom
  reminders: AlarmInput[]
}

const REPEAT_FROM_OPTIONS = [
  { value: String(RepeatFrom.DueDate), label: "From the due date" },
  { value: String(RepeatFrom.Completion), label: "From the day it is completed" },
]

const PRIORITY_NUMBER: Record<PriorityBand, number> = {
  [PriorityBand.None]: 0,
  [PriorityBand.Low]: 9,
  [PriorityBand.Medium]: 5,
  [PriorityBand.High]: 1,
}

/** The flag's colour for each band, as the list rows draw it. */
const PRIORITY_TONE: Record<PriorityBand, string> = {
  [PriorityBand.None]: "text-muted",
  [PriorityBand.Low]: "text-info",
  [PriorityBand.Medium]: "text-warning",
  [PriorityBand.High]: "text-danger",
}

/** The editor's large controls and their labels. */
const BIG =
  "rounded-lg border border-subtle bg-surface text-sm text-foreground placeholder:text-placeholder hover:border-control focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
const LABEL = "text-[13px] font-medium"

const PRIORITY_OPTIONS = [
  { value: String(PriorityBand.None), label: "None" },
  { value: String(PriorityBand.Low), label: "Low" },
  { value: String(PriorityBand.Medium), label: "Medium" },
  { value: String(PriorityBand.High), label: "High" },
]

/** The band an iCalendar priority number belongs to (Tasks.org's grouping). */
function bandOf(priority: number): PriorityBand {
  if (priority >= 1 && priority <= 4) return PriorityBand.High
  if (priority === 5) return PriorityBand.Medium
  if (priority >= 6 && priority <= 9) return PriorityBand.Low
  return PriorityBand.None
}

/** `HH:MM` of an iCalendar `HH:MM:SS`, which is what `<input type="time">` takes. */
function timeInput(value: TaskDate | undefined): string {
  return value?.time?.slice(0, 5) ?? ""
}

/** The date and time the inputs show for a value: a UTC time is read in `zone`, the rest as written. */
function shown(value: TaskDate | undefined, zone: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" }
  if (value.kind !== IcalDateKind.Utc || value.time === undefined) {
    return { date: value.date, time: timeInput(value) }
  }
  const instant = new Date(`${value.date}T${value.time}Z`)
  return { date: isoDateInTz(instant, zone), time: hhmmInTz(instant, zone) }
}

function fieldsOf(task: Task, zone: string): Fields {
  const due = shown(task.due, zone)
  const start = shown(task.start, zone)
  return {
    title: task.title,
    notes: task.notes,
    dueDate: due.date,
    dueTime: due.time,
    startDate: start.date,
    startTime: start.time,
    priority: task.priority,
    listHref: task.listHref,
    tags: [...task.tags],
    repeatRule: task.repeatRule ?? null,
    repeatFrom: task.repeatFrom ?? RepeatFrom.DueDate,
    reminders: task.reminders.map((reminder) => ({ trigger: reminder.alarm })),
  }
}

/** The fields whose value differs between two versions of the form. */
function changedFields(from: Fields, to: Fields): (keyof Fields)[] {
  return (Object.keys(to) as (keyof Fields)[]).filter((key) =>
    JSON.stringify(from[key]) !== JSON.stringify(to[key])
  )
}

/**
 * The date value for what the inputs hold. Untouched inputs give back the task's own value, so a
 * zone, a seconds part or a floating time survives a save that did not change it. A new time keeps
 * the kind and zone the old value had (a UTC time is converted from `zone` back to UTC); with none,
 * it is a floating time (the same wall clock
 * wherever it is read), because the screen does not know the user's zone.
 */
function dateOf(
  date: string,
  time: string,
  original: TaskDate | undefined,
  zone: string,
): TaskDate | null {
  if (!date) return null
  const before = shown(original, zone)
  if (original && before.date === date && before.time === time) return original
  if (!time) return { kind: IcalDateKind.Date, date }
  const timed = original?.time !== undefined
  const kind = timed ? original.kind : IcalDateKind.Floating
  if (kind === IcalDateKind.Utc) {
    // The inputs hold `zone`'s wall clock; the value is written back as the UTC moment it means.
    const utc = resolveWallClock(date, time, zone).instant.toISOString()
    return { kind, date: utc.slice(0, 10), time: `${utc.slice(11, 16)}:00` }
  }
  if (kind === IcalDateKind.Floating) return floatingDue(date, time)
  return {
    kind,
    date,
    time: `${time}:00`,
    ...(kind === IcalDateKind.Zoned && original?.tzid ? { tzid: original.tzid } : {}),
  }
}

const REPEAT_NEEDS_DUE = "Pick a due date. A repeating task counts its next date from it."

/** What is wrong with the form itself, before anything is sent. */
function check(fields: Fields, baseline: Fields): TaskEditorErrors {
  const errors: TaskEditorErrors = {}
  if (!fields.title.trim()) errors.title = "Enter a title."
  if (!fields.dueDate && fields.dueTime) errors.due = "Pick a due date for this time."
  if (!fields.startDate && fields.startTime) errors.start = "Pick a start date for this time."
  // Like the library: a repeating task that arrived without a due date can still be saved, but a
  // new or changed rule needs one, and a repeating task cannot lose the one it has.
  const leftAsItCame = fields.repeatRule === baseline.repeatRule && !baseline.dueDate
  if (fields.repeatRule && !fields.dueDate && !leftAsItCame) errors.due ??= REPEAT_NEEDS_DUE
  return errors
}

/**
 * The task editor: a page with title, notes, due and start (native date and optional time),
 * priority, list, tags, the repeat rule ({@link RepeatField}), what a repeating task counts its
 * next date from, and reminders ({@link RemindersField}).
 *
 * The screen holds the form's values itself and hands the whole form to `onSave`. Leaving with
 * changes asks first (`UnsavedGuard`). A refused save focuses the first field in error. Delete lives
 * in "More actions" and asks first. A save that collided with another device's edit opens
 * {@link ConflictDialog}.
 */
export function TaskEditorScreen(props: TaskEditorScreenProps): JSX.Element {
  const { task, navigate, saving = false } = props
  const backHref = props.backHref ?? "/"
  const zone = props.timeZone ?? `UTC`
  const titleMentions = useMentions(props.mentionLists ?? [], `task-title-mentions`)
  const notesMentions = useMentions(props.mentionLists ?? [], `task-notes-mentions`)
  // The version the form started from. It trails `task` while the form holds something typed that
  // the newer stored version lacks.
  const [base, setBase] = useState(task)
  const [fields, setFields] = useState(() => fieldsOf(task, zone))
  const baseline = useMemo(() => fieldsOf(base, zone), [base, zone])
  const [checked, setChecked] = useState<TaskEditorErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [asking, setAsking] = useState(false)
  const form = useRef<HTMLDivElement>(null)

  /** Drops what the form holds and starts it from the stored task. */
  const restart = () => {
    setBase(task)
    setFields(fieldsOf(task, zone))
    setChecked({})
  }

  // A newer stored version replaces the form only when nothing typed is lost by it: the form is
  // untouched, or the new version already holds every value that was typed (the save went through).
  // Otherwise another device changed the task, and the form keeps what was typed, on the version it
  // started from, whether or not the conflict has been reported yet. Once nothing typed would be
  // lost any more (the person typed their value themselves), the form catches up.
  useEffect(() => {
    if (base.uid === task.uid && base.etag === task.etag) return
    const stored = fieldsOf(task, zone)
    const typed = changedFields(baseline, fields)
    const lost = typed.some((key) => JSON.stringify(fields[key]) !== JSON.stringify(stored[key]))
    if (base.uid !== task.uid || !lost) restart()
  }, [task, fields])

  const errors: TaskEditorErrors = { ...props.errors, ...checked }
  const errorKey = `${errors.title ?? ""}|${errors.due ?? ""}|${errors.start ?? ""}|${
    errors.repeat ?? ""
  }`
  // Focus the first field in error, in page order. `attempt` makes a repeated refusal count.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus()
  }, [errorKey, attempt])

  const dirty = changedFields(baseline, fields).length > 0
  const set = (patch: Partial<Fields>) => {
    setFields((current) => ({ ...current, ...patch }))
    setChecked({})
  }

  const draft = (): TaskDraft => ({
    title: fields.title.trim(),
    notes: fields.notes,
    due: dateOf(fields.dueDate, fields.dueTime, base.due, zone),
    start: dateOf(fields.startDate, fields.startTime, base.start, zone),
    priority: fields.priority,
    listHref: fields.listHref,
    tags: fields.tags,
    repeatRule: fields.repeatRule,
    repeatFrom: fields.repeatRule ? fields.repeatFrom : RepeatFrom.DueDate,
    reminders: fields.reminders,
  })

  const save = () => {
    const problems = check(fields, baseline)
    setChecked(problems)
    if (Object.keys(problems).length > 0) {
      setAttempt((count) => count + 1)
      return
    }
    props.onSave(draft(), base)
  }

  /** Back saves what changed and goes back; with nothing changed it just goes back. */
  const back = () => {
    if (dirty) save()
    else navigate(backHref)
  }

  const band = bandOf(fields.priority)
  const listName = props.lists.find((list) => list.href === task.listHref)?.name
  const shownDue = fields.dueDate
    ? new Date(`${fields.dueDate}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: `long`,
      month: `long`,
      day: `numeric`,
      timeZone: `UTC`,
    })
    : ``

  return (
    <div class="task-editor flex w-full max-w-6xl flex-col gap-6 px-4 py-4 md:px-12 md:pt-8 md:pb-16">
      <UnsavedGuard
        when={dirty && !saving}
        navigate={navigate}
        owns={props.owns ?? (() => true)}
        leaveGuard={props.leaveGuard}
      />
      <div class="flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="-ms-2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
            onClick={back}
            disabled={saving}
            aria-label="Back"
            title="Back (saves your changes)"
            data-e2e="task-back"
          >
            <IconChevronLeft class="size-5" aria-hidden="true" />
          </button>
          {/* The list's name sits beside the heading, so the heading reads "Edit task" alone. */}
          <div class="flex min-w-0 items-baseline gap-3">
            <h1 class="shrink-0 text-2xl font-bold tracking-tight">Edit task</h1>
            {listName && <span class="truncate text-[15px] text-muted">{listName}</span>}
          </div>
        </div>
        <div class="flex items-center gap-2">
          {props.onDelete && (
            <button
              type="button"
              class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-subtle bg-surface px-3 text-sm text-danger hover:border-control disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
              disabled={props.deleting}
              onClick={() => {
                setAsking(true)
                props.onDeleteAsked?.()
              }}
              data-e2e="task-delete"
            >
              <IconTrashBin class="size-4" aria-hidden="true" />
              Delete
            </button>
          )}
          <button
            type="button"
            class="inline-flex h-9 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
            disabled={saving}
            onClick={save}
            data-e2e="task-save-top"
          >
            Save
          </button>
        </div>
      </div>
      <EnhancedForm
        status={saving ? "sending" : "idle"}
        labels={{ sending: "", done: "", failed: "" }}
        onSubmit={save}
        class="space-y-0!"
      >
        <div class="flex flex-col gap-6" ref={form} data-e2e="task-form">
          <div class="relative flex flex-col gap-2">
            <input
              id="task-title"
              name="title"
              autocomplete="off"
              aria-label="Title"
              aria-required="true"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "task-title-error" : undefined}
              class={`${BIG} h-11 w-full px-3 text-base font-medium`}
              value={fields.title}
              {...(titleMentions.open ? titleMentions.comboProps : {})}
              onInput={(event) => {
                set({ title: event.currentTarget.value })
                titleMentions.track(event.currentTarget)
              }}
              onClick={(event) => titleMentions.track(event.currentTarget)}
              onKeyDown={(event) => titleMentions.onKeyDown(event)}
              onBlur={titleMentions.close}
              data-e2e="task-title"
            />
            {titleMentions.menu}
            {errors.title && <p id="task-title-error" class="text-sm text-danger">{errors.title}
            </p>}
          </div>

          <div class="flex flex-wrap items-start gap-x-6 gap-y-6">
            <div class="flex min-w-0 max-w-xl flex-1 basis-80 flex-col gap-2">
              <label for="task-due-date" class={LABEL}>Due date</label>
              <div class="flex gap-2">
                <span
                  class={`${BIG} relative flex h-9 min-w-0 flex-1 items-center gap-2 px-3 focus-within:border-accent focus-within:outline-2 focus-within:outline-[var(--color-ring)]`}
                >
                  <IconCalendar class="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span class={`min-w-0 flex-1 truncate ${shownDue ? `` : `text-muted`}`}>
                    {shownDue || `Choose a date`}
                  </span>
                  <IconChevronDown class="size-3 shrink-0 text-muted" aria-hidden="true" />
                  <input
                    id="task-due-date"
                    name="task-due-date"
                    type="date"
                    class="absolute inset-0 cursor-pointer opacity-0"
                    aria-invalid={errors.due ? true : undefined}
                    aria-describedby={errors.due ? "task-due-error" : undefined}
                    value={fields.dueDate}
                    onClick={(event) => {
                      try {
                        event.currentTarget.showPicker?.()
                      } catch { /* a browser that will not open it here still takes typing */ }
                    }}
                    onInput={(event) => {
                      // A cleared date takes its time with it: the time box hides with the date.
                      const dueDate = event.currentTarget.value
                      set(dueDate ? { dueDate } : { dueDate, dueTime: "" })
                    }}
                    data-e2e="task-due-date"
                  />
                </span>
                {fields.dueDate && (
                  <input
                    name="task-due-time"
                    type="time"
                    aria-label="Due time (optional)"
                    class={`${BIG} h-9 w-32 px-3`}
                    value={fields.dueTime}
                    onInput={(event) => set({ dueTime: event.currentTarget.value })}
                    data-e2e="task-due-time"
                  />
                )}
              </div>
              {errors.due && <p id="task-due-error" class="text-sm text-danger">{errors.due}</p>}
            </div>
            <div class="flex flex-col gap-2">
              <label for="task-priority" class={LABEL}>Priority</label>
              <span class="relative block">
                <IconFlag
                  class={`pointer-events-none absolute inset-y-0 start-3 my-auto size-4 ${
                    PRIORITY_TONE[band]
                  }`}
                  aria-hidden="true"
                />
                <select
                  id="task-priority"
                  name="priority"
                  class={`${BIG} h-9 w-full min-w-40 cursor-pointer appearance-none ps-8 pe-8`}
                  value={String(band)}
                  // Only a change of band reaches here, so an untouched priority (a 3) is kept.
                  onChange={(event) =>
                    set({
                      priority: PRIORITY_NUMBER[Number(event.currentTarget.value) as PriorityBand],
                    })}
                  data-e2e="task-priority"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <IconChevronDown
                  class="pointer-events-none absolute inset-y-0 end-3 my-auto size-3 text-muted"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>

          <div class="relative flex flex-col gap-2">
            <label for="task-notes" class={LABEL}>Notes</label>
            <textarea
              id="task-notes"
              name="notes"
              rows={3}
              placeholder="Add details"
              class={`${BIG} block w-full resize-y px-3 py-2`}
              value={fields.notes}
              {...(notesMentions.open ? notesMentions.comboProps : {})}
              onInput={(event) => {
                set({ notes: event.currentTarget.value })
                notesMentions.track(event.currentTarget)
              }}
              onClick={(event) => notesMentions.track(event.currentTarget)}
              onKeyDown={(event) => notesMentions.onKeyDown(event)}
              onBlur={notesMentions.close}
              data-e2e="task-notes"
            />
            {notesMentions.menu}
          </div>

          <div class="flex flex-col gap-2 border-y border-subtle py-3">
            <details class="group/reminders" open={fields.reminders.length > 0 || undefined}>
              <summary class="flex min-h-9 cursor-pointer list-none items-center gap-3 text-sm">
                <span
                  class="size-4 shrink-0 rounded-full border-2 border-control group-open/reminders:border-accent"
                  aria-hidden="true"
                />
                Add a reminder <span class="text-muted">(optional)</span>
              </summary>
              <div class="pt-4">
                <RemindersField
                  id="task-reminders"
                  value={fields.reminders}
                  onChange={(reminders) => set({ reminders })}
                  hasDue={fields.dueDate !== ""}
                  hasStart={fields.startDate !== ""}
                  timeZone={zone}
                  disabled={saving}
                />
              </div>
            </details>
            <details
              class="group"
              open={Boolean(fields.startDate || fields.tags.length || fields.repeatRule) ||
                undefined}
            >
              <summary class="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-foreground">
                <IconChevronRight
                  class="size-4 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                More options
                <span class="text-xs">(start date, tags, repeat)</span>
              </summary>
              <div class="flex flex-col gap-4 pt-4">
                <DateRow
                  id="task-start"
                  label="Start"
                  error={errors.start}
                  date={fields.startDate}
                  time={fields.startTime}
                  onDate={(startDate) => set({ startDate })}
                  onTime={(startTime) => set({ startTime })}
                />
                <Field id="task-tags" label="Tags">
                  <TagInput
                    id="task-tags"
                    value={fields.tags}
                    onChange={(tags) => set({ tags })}
                    suggestions={props.tagSuggestions}
                  />
                </Field>
                <RepeatField
                  id="task-repeat"
                  value={fields.repeatRule}
                  onChange={(repeatRule) => set({ repeatRule })}
                  error={errors.repeat}
                  disabled={saving}
                  anchor={repeatAnchor(
                    fields.dueDate ? fields.dueTime : fields.startTime,
                    fields.dueDate ? base.due : base.start,
                    zone,
                  )}
                />
                {fields.repeatRule && (
                  <RadioGroup
                    id="task-repeat-from"
                    legend="Count the next date"
                    name="repeat-from"
                    class="flex flex-wrap gap-4"
                    options={REPEAT_FROM_OPTIONS}
                    value={String(fields.repeatFrom)}
                    onChange={(value) => set({ repeatFrom: Number(value) as RepeatFrom })}
                    data-e2e="task-repeat-from"
                  />
                )}
              </div>
            </details>
          </div>

          {errors.form && (
            <p role="alert" class="text-sm text-danger" data-e2e="task-form-error">
              {errors.form}
            </p>
          )}
          <div class="sticky bottom-16 flex gap-2 bg-canvas py-3 sm:static sm:justify-end sm:bg-transparent sm:py-0">
            <Button
              href={backHref}
              navigate={navigate}
              variant="outline"
              class="h-9 flex-1 rounded-lg px-4 text-sm font-normal sm:flex-none"
              data-e2e="task-cancel"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving ? "true" : undefined}
              class="h-9 flex-1 cursor-pointer rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] sm:flex-none"
              data-e2e="task-save"
            >
              {saving ? `Saving…` : `Save changes`}
            </button>
          </div>
        </div>
      </EnhancedForm>
      <Subtasks
        subtasks={props.subtasks ?? []}
        href={props.subtaskHref}
        navigate={navigate}
        onAdd={props.onAddSubtask}
      />
      {asking && (
        <ConfirmDialog
          title={deleteQuestion(props.subtaskCount ?? 0)}
          message={(props.subtaskCount ?? 0) > 0
            ? `"${task.title}" will be deleted with every subtask under it, completed ones too.`
            : `"${task.title}" will be deleted.`}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          tone="danger"
          dataE2E="task-delete-dialog"
          onConfirm={() => {
            setAsking(false)
            props.onDelete?.()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
      <ConflictDialog
        open={props.conflict === true}
        onKeepMine={() => props.onKeepMine?.(draft())}
        onUseTheirs={() => {
          // Their version is the current `task`: the form drops what was typed and starts from it.
          restart()
          props.onUseTheirs?.()
        }}
      />
    </div>
  )
}

/** A date input and its optional time, side by side, sharing one error. */
function DateRow(
  { id, label, error, date, time, onDate, onTime }: {
    id: string
    label: string
    error?: string
    date: string
    time: string
    onDate: (value: string) => void
    onTime: (value: string) => void
  },
): JSX.Element {
  return (
    <div class="grid grid-cols-2 gap-3">
      <Field id={`${id}-date`} label={`${label} date`} error={error} class="col-span-1">
        {(wiring) => (
          <Input
            id={wiring.id}
            name={`${id}-date`}
            type="date"
            aria-invalid={error ? true : undefined}
            aria-describedby={wiring["aria-describedby"]}
            value={date}
            onInput={(event) => onDate(event.currentTarget.value)}
            data-e2e={`${id}-date`}
          />
        )}
      </Field>
      <Field id={`${id}-time`} label={`${label} time (optional)`} class="col-span-1">
        <Input
          name={`${id}-time`}
          type="time"
          value={time}
          onInput={(event) => onTime(event.currentTarget.value)}
          data-e2e={`${id}-time`}
        />
      </Field>
    </div>
  )
}

/** The delete question for a task that takes `subtasks` tasks with it. */
function deleteQuestion(subtasks: number): string {
  if (subtasks <= 0) return `Delete this task?`
  return `Delete this task and its ${subtasks} ${subtasks === 1 ? `subtask` : `subtasks`}?`
}

/** The task's subtasks, and a small form of its own (outside the editor's) to add one. */
function Subtasks(
  { subtasks, href, navigate, onAdd }: {
    subtasks: readonly Task[]
    href?: (subtask: Task) => string
    navigate: (href: string) => void
    onAdd?: (title: string) => void
  },
): JSX.Element | null {
  const [title, setTitle] = useState("")
  if (subtasks.length === 0 && !onAdd) return null
  const add = (event: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    const text = title.trim()
    if (!text) return
    onAdd?.(text)
    setTitle("")
  }
  return (
    <section aria-labelledby="task-subtasks-heading" data-e2e="task-subtasks">
      <h2 id="task-subtasks-heading" class="pc-label">Subtasks</h2>
      {subtasks.length > 0 && (
        <ul class="mt-2 space-y-1">
          {subtasks.map((subtask) => (
            <li
              key={subtask.uid}
              class={subtask.status === TaskStatus.Completed ? "text-muted line-through" : ""}
              data-e2e="task-subtask"
            >
              {href
                ? (
                  <Link href={href(subtask)} navigate={navigate} class="pc-link">
                    {subtask.title}
                  </Link>
                )
                : subtask.title}
              {subtask.status === TaskStatus.Completed && <span class="sr-only">(done)</span>}
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <form onSubmit={add} class="mt-3 flex items-end gap-3" data-e2e="task-subtask-form">
          <Field id="task-subtask-title" label="New subtask" class="flex-1">
            <Input
              name="subtask"
              autocomplete="off"
              value={title}
              onInput={(event) => setTitle(event.currentTarget.value)}
              data-e2e="task-subtask-title"
            />
          </Field>
          <Button type="submit" variant="outline" data-e2e="task-subtask-add">Add subtask</Button>
        </form>
      )}
    </section>
  )
}
