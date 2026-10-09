import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { IconBell, IconPlus, IconTrashBin } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { Field } from "@spy4x/preact-ui/field"
import { Input, Select } from "@spy4x/preact-ui/input"
import { IcalDateKind } from "@spy4x/time/ical"
import {
  type AlarmInput,
  AlarmRelated,
  AlarmTriggerKind,
  describeAlarmTrigger,
} from "@spy4x/time/ical-tasks"
import { resolveWallClock } from "@spy4x/time/tz"

/** Props of {@link RemindersField}. */
export interface RemindersFieldProps {
  /** Prefix of the ids and `data-e2e` names. */
  id: string
  /** The reminders the task has afterwards: the ones it carries, less removed, plus added. */
  value: readonly AlarmInput[]
  /** Called with the whole new list. */
  onChange: (value: AlarmInput[]) => void
  /** Whether the form has a due date: a reminder counted from it needs one. */
  hasDue: boolean
  /** Whether the form has a start date: a reminder counted from it needs one. */
  hasStart: boolean
  /** The IANA zone a fixed moment is typed and shown in. Defaults to `UTC`. */
  timeZone?: string
  disabled?: boolean
}

enum Anchor {
  BeforeDue = `before-due`,
  AtDue = `at-due`,
  BeforeStart = `before-start`,
  AtStart = `at-start`,
  Fixed = `fixed`,
}

const ANCHORS = [
  { value: Anchor.BeforeDue, label: `Before due` },
  { value: Anchor.AtDue, label: `At due` },
  { value: Anchor.BeforeStart, label: `Before start` },
  { value: Anchor.AtStart, label: `At start` },
  { value: Anchor.Fixed, label: `At a fixed time` },
]

const UNITS = [
  { value: `M`, label: `minutes` },
  { value: `H`, label: `hours` },
  { value: `D`, label: `days` },
]

/** The `VALARM` duration such as `-PT15M` for an amount before (negative) the anchor. */
function duration(amount: number, unit: string, before: boolean): string {
  if (amount === 0) return `PT0S`
  const body = unit === `D` ? `P${amount}D` : `PT${amount}${unit}`
  return before ? `-${body}` : body
}

/** The reminder the add form describes, or why it cannot be added. */
function build(
  anchor: Anchor,
  amountText: string,
  unit: string,
  moment: string,
  zone: string,
): { reminder: AlarmInput } | { error: string; field: `moment` | `amount` } {
  if (anchor === Anchor.Fixed) {
    const [date, time] = moment.split(`T`)
    if (!date || !time) return { error: `Pick the date and time of the reminder.`, field: `moment` }
    const utc = resolveWallClock(date, time, zone).instant.toISOString()
    return {
      reminder: {
        trigger: {
          kind: AlarmTriggerKind.Absolute,
          at: { kind: IcalDateKind.Utc, date: utc.slice(0, 10), time: `${utc.slice(11, 16)}:00` },
        },
      },
    }
  }
  const atAnchor = anchor === Anchor.AtDue || anchor === Anchor.AtStart
  const amount = atAnchor ? 0 : Number(amountText)
  if (!atAnchor && (!Number.isInteger(amount) || amount < 1 || amount > 999)) {
    return { error: `Enter a whole number of 1 or more.`, field: `amount` }
  }
  const fromEnd = anchor === Anchor.BeforeDue || anchor === Anchor.AtDue
  return {
    reminder: {
      trigger: {
        kind: AlarmTriggerKind.Relative,
        duration: duration(amount, unit, true),
        related: fromEnd ? AlarmRelated.End : AlarmRelated.Start,
      },
    },
  }
}

/** A reminder in words; one the library cannot describe is shown as written. */
function describe(reminder: AlarmInput, timeZone: string): string {
  const { trigger } = reminder
  const alarm = trigger.kind === AlarmTriggerKind.Relative
    ? { ...trigger, related: trigger.related ?? AlarmRelated.Start }
    : trigger
  const words = describeAlarmTrigger(alarm, { timeZone })
  if (words) return words
  return trigger.kind === AlarmTriggerKind.Relative ? trigger.duration : `a time`
}

/**
 * The reminders control: the task's reminders in words, each with a Remove button, and a small
 * form to add one before or at the due or start time, or at a fixed time. The add form sits inside
 * the editor's form but is not a form of its own, and Enter in its number box adds the reminder
 * instead of saving the task. A reminder written by Tasks.org that the form cannot build (after
 * due, in weeks) is listed and kept like any other until it is removed.
 */
export function RemindersField(
  { id, value, onChange, hasDue, hasStart, timeZone = `UTC`, disabled }: RemindersFieldProps,
): JSX.Element {
  const [anchor, setAnchor] = useState<Anchor>(Anchor.BeforeDue)
  const [amount, setAmount] = useState(`15`)
  const [unit, setUnit] = useState(`M`)
  const [moment, setMoment] = useState(``)
  const [problem, setProblem] = useState<{ field: `anchor` | `moment` | `amount`; text: string }>()
  const section = useRef<HTMLElement>(null)
  // Set by Remove: the index the removed row had, so focus can move once the list has shrunk.
  const removedAt = useRef<number>()
  useEffect(() => {
    const at = removedAt.current
    if (at === undefined) return
    removedAt.current = undefined
    const buttons = section.current?.querySelectorAll<HTMLElement>(
      `[data-e2e="task-reminder-remove"]`,
    )
    // The button now at the same place is the next reminder's; else the one before; else the add row.
    const target = buttons?.[at] ?? buttons?.[at - 1] ??
      section.current?.querySelector<HTMLElement>(`[data-e2e="${id}-anchor"]`)
    target?.focus()
  }, [value])

  const add = () => {
    const needsDue = anchor === Anchor.BeforeDue || anchor === Anchor.AtDue
    const needsStart = anchor === Anchor.BeforeStart || anchor === Anchor.AtStart
    if (needsDue && !hasDue) {
      return setProblem({
        field: `anchor`,
        text: `Set a due date first: this reminder counts from it.`,
      })
    }
    if (needsStart && !hasStart) {
      return setProblem({
        field: `anchor`,
        text: `Set a start date first: this reminder counts from it.`,
      })
    }
    const built = build(anchor, amount, unit, moment, timeZone)
    if (`error` in built) return setProblem({ field: built.field, text: built.error })
    setProblem(undefined)
    onChange([...value, built.reminder])
  }

  const problemOf = (field: `anchor` | `moment` | `amount`) =>
    problem?.field === field ? problem.text : undefined
  const fixed = anchor === Anchor.Fixed
  const atAnchor = anchor === Anchor.AtDue || anchor === Anchor.AtStart
  return (
    <section ref={section} aria-labelledby={`${id}-heading`} data-e2e="task-reminders">
      <h2 id={`${id}-heading`} class="pc-label">Reminders</h2>
      {value.length === 0
        ? <p class="mt-2 text-sm text-muted" data-e2e="task-reminders-empty">No reminders.</p>
        : (
          <ul class="mt-2 space-y-1">
            {value.map((reminder, index) => (
              <li key={index} class="flex items-center gap-2 text-sm" data-e2e="task-reminder">
                <IconBell class="size-4 text-muted" aria-hidden="true" />
                <span class="flex-1" data-e2e="task-reminder-label">
                  {describe(reminder, timeZone)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  aria-label={`Remove reminder: ${describe(reminder, timeZone)}`}
                  onClick={() => {
                    removedAt.current = index
                    onChange(value.filter((_, at) =>
                      at !== index
                    ))
                  }}
                  data-e2e="task-reminder-remove"
                >
                  <IconTrashBin class="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      <div
        class="mt-3 flex flex-wrap items-end gap-3"
        onKeyDown={(event) => {
          if (event.key !== `Enter` || (event.target as HTMLElement).tagName === `BUTTON`) return
          event.preventDefault()
          add()
        }}
      >
        <Field id={`${id}-anchor`} label="New reminder" error={problemOf(`anchor`)}>
          {(wiring) => (
            <Select
              id={wiring.id}
              name={`${id}-anchor`}
              options={ANCHORS}
              value={anchor}
              disabled={disabled}
              aria-invalid={problemOf(`anchor`) ? true : undefined}
              aria-describedby={wiring["aria-describedby"]}
              onChange={(event) => {
                setAnchor(event.currentTarget.value as Anchor)
                setProblem(undefined)
              }}
              data-e2e={`${id}-anchor`}
            />
          )}
        </Field>
        {fixed && (
          <Field
            id={`${id}-moment`}
            label="Reminder date and time"
            error={problemOf(`moment`)}
          >
            {(wiring) => (
              <Input
                id={wiring.id}
                name={`${id}-moment`}
                type="datetime-local"
                value={moment}
                disabled={disabled}
                aria-invalid={problemOf(`moment`) ? true : undefined}
                aria-describedby={wiring["aria-describedby"]}
                onInput={(event) => setMoment(event.currentTarget.value)}
                data-e2e={`${id}-moment`}
              />
            )}
          </Field>
        )}
        {!fixed && !atAnchor && (
          <>
            <Field id={`${id}-amount`} label="Amount" class="w-32" error={problemOf(`amount`)}>
              {(wiring) => (
                <Input
                  id={wiring.id}
                  name={`${id}-amount`}
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  disabled={disabled}
                  aria-invalid={problemOf(`amount`) ? true : undefined}
                  aria-describedby={wiring["aria-describedby"]}
                  onInput={(event) => setAmount(event.currentTarget.value)}
                  data-e2e={`${id}-amount`}
                />
              )}
            </Field>
            <Field id={`${id}-unit`} label="Unit">
              <Select
                name={`${id}-unit`}
                options={UNITS}
                value={unit}
                disabled={disabled}
                onChange={(event) => setUnit(event.currentTarget.value)}
                data-e2e={`${id}-unit`}
              />
            </Field>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={add}
          data-e2e="task-reminder-add"
        >
          <IconPlus class="size-4" aria-hidden="true" /> Add reminder
        </Button>
      </div>
    </section>
  )
}
