import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { hhmmInTz, isoDateInTz, resolveWallClock } from "@spy4x/time/tz"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { EnhancedForm } from "@spy4x/preact-ui/enhanced-form"
import { Field } from "@spy4x/preact-ui/field"
import { Input, Select, Textarea } from "@spy4x/preact-ui/input"
import { Link } from "@spy4x/preact-ui/link"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { RadioGroup } from "@spy4x/preact-ui/radio"
import { TagInput } from "@spy4x/preact-ui/tag-input"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { IcalDateKind } from "@spy4x/time/ical"
import { type AlarmInput } from "@spy4x/time/ical-tasks"
import { floatingDue } from "./due-label.ts"
import {
  PriorityBand,
  type Task,
  type TaskDate,
  type TaskList,
  TaskStatus,
} from "@spy4x/time/ical-tasks-model"
import { ConflictDialog } from "./conflict-dialog.tsx"
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
  /** The task as stored. A new `etag` (a save went through, or "Use theirs") resets the form. */
  task: Task
  /** Every list, for the list choice. */
  lists: readonly TaskList[]
  /** Tags used elsewhere, offered while typing. */
  tagSuggestions?: readonly string[]
  /** The task's direct subtasks. */
  subtasks?: readonly Task[]
  /** Where a subtask opens, to make its title a link. */
  subtaskHref?: (subtask: Task) => string
  /** Called with the whole form when it is valid and Save is pressed. Never while `saving`. */
  onSave: (draft: TaskDraft) => void
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
  /** A delete is running. */
  deleting?: boolean
  /** Moves the app's router to an address: Back, Cancel, subtasks, and leaving past the guard. */
  navigate: (href: string) => void
  /** Whether the router handles an address, for the guard. Defaults to every address. */
  owns?: (url: URL) => boolean
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
  reminders: AlarmInput[]
}

const PRIORITY_NUMBER: Record<PriorityBand, number> = {
  [PriorityBand.None]: 0,
  [PriorityBand.Low]: 9,
  [PriorityBand.Medium]: 5,
  [PriorityBand.High]: 1,
}

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
    reminders: task.reminders.map((reminder) => ({ trigger: reminder.alarm })),
  }
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

/** What is wrong with the form itself, before anything is sent. */
function check(fields: Fields, baseline: Fields): TaskEditorErrors {
  const errors: TaskEditorErrors = {}
  if (!fields.title.trim()) errors.title = "Enter a title."
  if (!fields.dueDate && fields.dueTime) errors.due = "Pick a due date for this time."
  if (!fields.startDate && fields.startTime) errors.start = "Pick a start date for this time."
  // Like the library: a rule the task already has is not refused, only a new or changed one.
  if (
    fields.repeatRule && fields.repeatRule !== baseline.repeatRule && !fields.dueDate &&
    !fields.startDate
  ) {
    errors.repeat = "A task needs a start or due date to repeat from."
  }
  return errors
}

/**
 * The task editor: a page with title, notes, due and start (native date and optional time),
 * priority, list, tags, the repeat rule ({@link RepeatField}) and reminders
 * ({@link RemindersField}).
 *
 * The screen holds the form's values itself and hands the whole form to `onSave`. Leaving with
 * changes asks first (`UnsavedGuard`). A refused save focuses the first field in error. Delete lives
 * in "More actions" and asks first. A save that collided with another device's edit opens
 * {@link ConflictDialog}.
 */
export function TaskEditorScreen(props: TaskEditorScreenProps): JSX.Element {
  const { task, lists, navigate, saving = false } = props
  const backHref = props.backHref ?? "/"
  const zone = props.timeZone ?? `UTC`
  const [fields, setFields] = useState(() => fieldsOf(task, zone))
  const [baseline, setBaseline] = useState(() => fieldsOf(task, zone))
  const [checked, setChecked] = useState<TaskEditorErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [asking, setAsking] = useState(false)
  const form = useRef<HTMLDivElement>(null)
  const seen = useRef({ uid: task.uid, etag: task.etag })

  // A newer stored version (a save went through, or "Use theirs") replaces the form. During a
  // conflict it does not: the form keeps what was typed until a choice is made.
  useEffect(() => {
    if (seen.current.uid === task.uid && seen.current.etag === task.etag) return
    seen.current = { uid: task.uid, etag: task.etag }
    if (props.conflict) return
    setFields(fieldsOf(task, zone))
    setBaseline(fieldsOf(task, zone))
    setChecked({})
  }, [task, props.conflict])

  const errors: TaskEditorErrors = { ...props.errors, ...checked }
  const errorKey = `${errors.title ?? ""}|${errors.due ?? ""}|${errors.start ?? ""}|${
    errors.repeat ?? ""
  }`
  // Focus the first field in error, in page order. `attempt` makes a repeated refusal count.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus()
  }, [errorKey, attempt])

  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline)
  const set = (patch: Partial<Fields>) => {
    setFields((current) => ({ ...current, ...patch }))
    setChecked({})
  }

  const draft = (): TaskDraft => ({
    title: fields.title.trim(),
    notes: fields.notes,
    due: dateOf(fields.dueDate, fields.dueTime, task.due, zone),
    start: dateOf(fields.startDate, fields.startTime, task.start, zone),
    priority: fields.priority,
    listHref: fields.listHref,
    tags: fields.tags,
    repeatRule: fields.repeatRule,
    reminders: fields.reminders,
  })

  const save = () => {
    const problems = check(fields, baseline)
    setChecked(problems)
    if (Object.keys(problems).length > 0) {
      setAttempt((count) => count + 1)
      return
    }
    props.onSave(draft())
  }

  const listName = lists.find((list) => list.href === task.listHref)?.name

  return (
    <div class="mx-auto w-full max-w-2xl space-y-6">
      <UnsavedGuard when={dirty} navigate={navigate} owns={props.owns ?? (() => true)} />
      <PageHeader
        title="Edit task"
        subtitle={listName}
        back={{ href: backHref, label: "Back" }}
        navigate={navigate}
        menu={props.onDelete && (
          <DropdownItem
            danger
            disabled={props.deleting}
            onClick={() => setAsking(true)}
            dataE2E="task-delete"
          >
            Delete task
          </DropdownItem>
        )}
        menuDataE2E="task-menu"
      />
      <EnhancedForm
        status={saving ? "sending" : "idle"}
        labels={{ sending: "", done: "", failed: "" }}
        onSubmit={save}
        class="space-y-0!"
      >
        <div class="space-y-4" ref={form} data-e2e="task-form">
          <Field id="task-title" label="Title" error={errors.title} required>
            {(wiring) => (
              <Input
                id={wiring.id}
                name="title"
                autocomplete="off"
                aria-required="true"
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={wiring["aria-describedby"]}
                value={fields.title}
                onInput={(event) => set({ title: event.currentTarget.value })}
                data-e2e="task-title"
              />
            )}
          </Field>
          <Field id="task-notes" label="Notes">
            <Textarea
              name="notes"
              rows={5}
              value={fields.notes}
              onInput={(event) => set({ notes: event.currentTarget.value })}
              data-e2e="task-notes"
            />
          </Field>
          <DateRow
            id="task-due"
            label="Due"
            error={errors.due}
            date={fields.dueDate}
            time={fields.dueTime}
            onDate={(dueDate) => set({ dueDate })}
            onTime={(dueTime) => set({ dueTime })}
          />
          <DateRow
            id="task-start"
            label="Start"
            error={errors.start}
            date={fields.startDate}
            time={fields.startTime}
            onDate={(startDate) => set({ startDate })}
            onTime={(startTime) => set({ startTime })}
          />
          <RadioGroup
            id="task-priority"
            legend="Priority"
            name="priority"
            class="flex flex-wrap gap-4"
            options={PRIORITY_OPTIONS}
            value={String(bandOf(fields.priority))}
            // Only a change of band reaches here, so an untouched priority (a 3, say) is kept as is.
            onChange={(value) => set({ priority: PRIORITY_NUMBER[Number(value) as PriorityBand] })}
          />
          <Field id="task-list" label="List">
            <Select
              name="list"
              options={lists.map((list) => ({ value: list.href, label: list.name }))}
              value={fields.listHref}
              onChange={(event) => set({ listHref: event.currentTarget.value })}
              data-e2e="task-list"
            />
          </Field>
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
              fields.dueDate ? task.due : task.start,
              zone,
            )}
          />
          <RemindersField
            id="task-reminders"
            value={fields.reminders}
            onChange={(reminders) => set({ reminders })}
            hasDue={fields.dueDate !== ""}
            hasStart={fields.startDate !== ""}
            timeZone={zone}
            disabled={saving}
          />
          {errors.form && (
            <p role="alert" class="text-sm text-danger" data-e2e="task-form-error">
              {errors.form}
            </p>
          )}
          <div class="sticky bottom-0 flex gap-3 border-t border-subtle bg-canvas py-3 sm:static sm:justify-end sm:border-0 sm:bg-transparent sm:py-0">
            <Button
              href={backHref}
              navigate={navigate}
              variant="outline"
              class="flex-1 sm:flex-none"
              data-e2e="task-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={saving}
              busyLabel="Saving…"
              class="flex-1 sm:flex-none"
              data-e2e="task-save"
            >
              Save
            </Button>
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
          title="Delete this task?"
          message={`"${task.title}" will be deleted.`}
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
          setFields(fieldsOf(task, zone))
          setBaseline(fieldsOf(task, zone))
          setChecked({})
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
