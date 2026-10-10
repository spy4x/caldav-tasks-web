import type { JSX } from "preact"
import { useEffect, useState } from "preact/hooks"
import { IconArrowPath } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { Field } from "@spy4x/preact-ui/field"
import { Input, Select } from "@spy4x/preact-ui/input"
import { ToggleChips } from "@spy4x/preact-ui/toggle-chips"
import { IcalDateKind, type IcalDateValue } from "@spy4x/time/ical"
import {
  describeRrule,
  formatRrule,
  parseRrule,
  type Rrule,
  RruleFreq,
  RruleWeekday,
} from "@spy4x/time/rrule"
import { isoDateInTz, resolveWallClock } from "@spy4x/time/tz"

/** Props of {@link RepeatField}. */
export interface RepeatFieldProps {
  /** Prefix of the ids and `data-e2e` names of the controls. */
  id: string
  /** The `RRULE` value as the task holds it, without the `RRULE:` prefix; `null` for no repeat. */
  value: string | null
  /** Called with the new `RRULE` value, or `null` when the person picks "Does not repeat". */
  onChange: (value: string | null) => void
  /** Why the rule cannot be saved, shown under the control. */
  error?: string
  disabled?: boolean
  /**
   * Whether the date the task repeats from (its due date, else its start) has a time. An end date
   * is then written as a UTC moment, the end of that day in `timeZone`, as RFC 5545 asks for a
   * timed task; otherwise it is a plain date. Default: no time.
   */
  timed?: boolean
  /** The zone an end date is read and written in when `timed`. Default `UTC`. */
  timeZone?: string
}

const NONE = `none`
const CUSTOM = `custom`

const END_NEVER = `never`
const END_DATE = `date`
const END_COUNT = `count`

const FREQ_OPTIONS = [
  { value: String(RruleFreq.Daily), label: `Daily` },
  { value: String(RruleFreq.Weekly), label: `Weekly` },
  { value: String(RruleFreq.Monthly), label: `Monthly` },
  { value: String(RruleFreq.Yearly), label: `Yearly` },
]

const END_OPTIONS = [
  { value: END_NEVER, label: `Never` },
  { value: END_DATE, label: `On a date` },
  { value: END_COUNT, label: `After a number of times` },
]

/** The week as the app shows it: Monday first, matching the `WKST` the control writes. */
const DAY_OPTIONS = [
  { value: String(RruleWeekday.Monday), label: `Mon` },
  { value: String(RruleWeekday.Tuesday), label: `Tue` },
  { value: String(RruleWeekday.Wednesday), label: `Wed` },
  { value: String(RruleWeekday.Thursday), label: `Thu` },
  { value: String(RruleWeekday.Friday), label: `Fri` },
  { value: String(RruleWeekday.Saturday), label: `Sat` },
  { value: String(RruleWeekday.Sunday), label: `Sun` },
]

const WEEKDAYS = [1, 2, 3, 4, 5]

const UNIT: Record<RruleFreq, string> = {
  [RruleFreq.Daily]: `day`,
  [RruleFreq.Weekly]: `week`,
  [RruleFreq.Monthly]: `month`,
  [RruleFreq.Yearly]: `year`,
}

/**
 * Whether the screen can show a rule in its controls and write it back whole: a frequency, an
 * interval, an end, and for a weekly rule plain weekdays. Month days, months, ordinals and another
 * week start are left to the "Custom" fallback.
 */
function isPlain(rule: Rrule): boolean {
  return rule.byMonthDay.length === 0 && rule.byMonth.length === 0 &&
    rule.weekStart === RruleWeekday.Monday &&
    (rule.byDay.length === 0 ||
      (rule.freq === RruleFreq.Weekly && rule.byDay.every((day) => day.ordinal === undefined)))
}

/** The rule as `RRULE` text, or `null` when the library refuses it. */
function write(rule: Rrule): string | null {
  const text = formatRrule(rule)
  return text.success ? text.output : null
}

/** A rule of `freq` and `interval` with nothing else. */
function bare(freq: RruleFreq, interval: number): Rrule {
  return {
    freq,
    interval,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    weekStart: RruleWeekday.Monday,
  }
}

/** The calendar day an `UNTIL` value falls on, as the person reads it in `zone`. */
function untilDay(until: IcalDateValue, zone: string): string {
  if (until.kind !== IcalDateKind.Utc || until.time === undefined) return until.date
  return isoDateInTz(new Date(`${until.date}T${until.time}Z`), zone)
}

/** The `UNTIL` for an end on `day`: a date, or the last second of that day in `zone` as UTC. */
function untilOf(day: string, timed: boolean, zone: string): IcalDateValue | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  if (!timed) return { kind: IcalDateKind.Date, date: day }
  try {
    const instant = resolveWallClock(day, `23:59`, zone).instant
    const utc = new Date(instant.getTime() + 59_000).toISOString()
    return { kind: IcalDateKind.Utc, date: utc.slice(0, 10), time: utc.slice(11, 19) }
  } catch {
    return undefined
  }
}

/** Reads a whole number in `min` to `max` from what a person typed, or `undefined`. */
function whole(text: string, min: number, max: number): number | undefined {
  const value = Number(text)
  return text.trim() !== `` && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined
}

/**
 * The repeat control: a choice of none, daily, weekly, monthly or yearly, "every N" units, for a
 * weekly rule the days of the week, and an end (never, on a date, or after a number of times).
 * A rule the control cannot build (a month day, an ordinal, another week start) is read from the
 * task, shown in words as the selected "Custom" choice and passed through untouched until the
 * person picks one of the others. Changing the interval or the days keeps the rule's end.
 */
export function RepeatField(
  { id, value, onChange, error, disabled, timed = false, timeZone = `UTC` }: RepeatFieldProps,
): JSX.Element {
  const parsed = value ? parseRrule(value) : undefined
  const rule = parsed?.success ? parsed.output : undefined
  const plain = rule && isPlain(rule) ? rule : undefined
  const mode = !value ? NONE : plain ? String(plain.freq) : CUSTOM
  const interval = plain?.interval ?? rule?.interval ?? 1
  const [text, setText] = useState(String(interval))
  useEffect(() => setText(String(interval)), [interval])

  const ruleEnd = plain?.until ? END_DATE : plain?.count !== undefined ? END_COUNT : END_NEVER
  const [endMode, setEndMode] = useState(ruleEnd)
  // An end chosen but not yet filled in is not part of the rule; any other change of the rule's
  // own end (another task, a new rule) wins.
  useEffect(() => {
    if (ruleEnd !== END_NEVER) setEndMode(ruleEnd)
  }, [ruleEnd])
  useEffect(() => {
    if (!value) setEndMode(END_NEVER)
  }, [value])
  const endDay = plain?.until ? untilDay(plain.until, timeZone) : ``
  const [countText, setCountText] = useState(String(plain?.count ?? ``))
  useEffect(() => setCountText(String(plain?.count ?? ``)), [plain?.count])

  const customLabel = rule ? describeRrule(rule) : value
  const options = [
    { value: NONE, label: `Does not repeat` },
    ...(mode === CUSTOM ? [{ value: CUSTOM, label: `Custom: ${customLabel}` }] : []),
    ...FREQ_OPTIONS,
  ]

  const days = plain ? plain.byDay.map((day) => String(day.weekday)) : []

  /** Writes `next`, or does nothing when the library refuses it. */
  const emit = (next: Rrule) => {
    const out = write(next)
    if (out !== null) onChange(out)
  }

  const pick = (next: string) => {
    if (next === NONE) return onChange(null)
    if (next === CUSTOM) return
    const freq = Number(next) as RruleFreq
    // The end carries over to another frequency; the days belong to a weekly rule only.
    const base = plain ?? bare(freq, interval)
    emit({
      ...base,
      freq,
      interval,
      byDay: freq === RruleFreq.Weekly ? base.byDay : [],
    })
  }

  const setInterval = (next: string) => {
    setText(next)
    const count = whole(next, 1, 999)
    if (plain && count !== undefined) emit({ ...plain, interval: count })
  }

  const setDays = (weekdays: number[]) => {
    if (!plain) return
    emit({ ...plain, byDay: weekdays.map((weekday) => ({ weekday })) })
  }

  const pickEnd = (next: string) => {
    setEndMode(next)
    if (!plain) return
    if (next === END_NEVER) emit({ ...plain, until: undefined, count: undefined })
    // A date or a count is written once the person has given one.
    else if (next === END_DATE && plain.count !== undefined) {
      emit({ ...plain, count: undefined })
    } else if (next === END_COUNT && plain.until) emit({ ...plain, until: undefined })
  }

  const setEndDay = (day: string) => {
    if (!plain) return
    const until = untilOf(day, timed, timeZone)
    emit({ ...plain, count: undefined, until })
  }

  const setCount = (next: string) => {
    setCountText(next)
    if (!plain) return
    const count = whole(next, 1, 999)
    if (count !== undefined) emit({ ...plain, until: undefined, count })
    else if (next.trim() === ``) emit({ ...plain, count: undefined })
  }

  return (
    <div class="space-y-2" data-e2e="task-repeat">
      <Field id={`${id}-freq`} label="Repeat" error={error}>
        {(wiring) => (
          <Select
            id={wiring.id}
            name={`${id}-freq`}
            options={options}
            value={mode}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={wiring["aria-describedby"]}
            onChange={(event) => pick(event.currentTarget.value)}
            data-e2e={`${id}-freq`}
          />
        )}
      </Field>
      {plain && (
        <div class="flex flex-wrap items-end gap-3">
          <Field id={`${id}-interval`} label={`Every (${UNIT[plain.freq]}s)`} class="w-32">
            <Input
              name={`${id}-interval`}
              type="number"
              min={1}
              max={999}
              step={1}
              inputMode="numeric"
              value={text}
              disabled={disabled}
              onInput={(event) => setInterval(event.currentTarget.value)}
              data-e2e={`${id}-interval`}
            />
          </Field>
          <p class="flex items-center gap-2 pb-2 text-sm text-muted">
            <IconArrowPath class="size-4" aria-hidden="true" />
            <span data-e2e="task-repeat-label">{describeRrule(plain)}</span>
          </p>
        </div>
      )}
      {plain?.freq === RruleFreq.Weekly && (
        <div class="flex flex-wrap items-center gap-2" data-e2e={`${id}-days`}>
          <ToggleChips
            label="Repeat on"
            options={DAY_OPTIONS.map((option) => ({ ...option, disabled }))}
            value={days}
            onChange={(next) =>
              setDays(next.map(Number))}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              setDays(WEEKDAYS)}
            data-e2e={`${id}-weekdays`}
          >
            Weekdays
          </Button>
        </div>
      )}
      {plain && (
        <div class="flex flex-wrap items-end gap-3">
          <Field id={`${id}-end`} label="Ends" class="w-52">
            <Select
              name={`${id}-end`}
              options={END_OPTIONS}
              value={endMode}
              disabled={disabled}
              onChange={(event) => pickEnd(event.currentTarget.value)}
              data-e2e={`${id}-end`}
            />
          </Field>
          {endMode === END_DATE && (
            <Field id={`${id}-until`} label="End date" class="w-44">
              <Input
                name={`${id}-until`}
                type="date"
                value={endDay}
                disabled={disabled}
                onInput={(event) => setEndDay(event.currentTarget.value)}
                data-e2e={`${id}-until`}
              />
            </Field>
          )}
          {endMode === END_COUNT && (
            <Field id={`${id}-count`} label="Times" class="w-28">
              <Input
                name={`${id}-count`}
                type="number"
                min={1}
                max={999}
                step={1}
                inputMode="numeric"
                value={countText}
                disabled={disabled}
                onInput={(event) => setCount(event.currentTarget.value)}
                data-e2e={`${id}-count`}
              />
            </Field>
          )}
        </div>
      )}
      {mode === CUSTOM && (
        <p class="flex items-center gap-2 text-sm text-muted">
          <IconArrowPath class="size-4" aria-hidden="true" />
          <span data-e2e="task-repeat-label">{customLabel}</span>
        </p>
      )}
    </div>
  )
}
