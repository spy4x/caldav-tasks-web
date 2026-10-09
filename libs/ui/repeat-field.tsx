import type { JSX } from "preact"
import { useEffect, useState } from "preact/hooks"
import { IconArrowPath } from "@spy4x/preact-icons"
import { Field } from "@spy4x/preact-ui/field"
import { Input, Select } from "@spy4x/preact-ui/input"
import {
  describeRrule,
  formatRrule,
  parseRrule,
  type Rrule,
  RruleFreq,
  RruleWeekday,
} from "@spy4x/time/rrule"

/** Props of {@link RepeatField}. */
export interface RepeatFieldProps {
  /** Prefix of the ids and `data-e2e` names of the two controls. */
  id: string
  /** The `RRULE` value as the task holds it, without the `RRULE:` prefix; `null` for no repeat. */
  value: string | null
  /** Called with the new `RRULE` value, or `null` when the person picks "Does not repeat". */
  onChange: (value: string | null) => void
  /** Why the rule cannot be saved, shown under the control. */
  error?: string
  disabled?: boolean
}

const NONE = `none`
const CUSTOM = `custom`

const FREQ_OPTIONS = [
  { value: String(RruleFreq.Daily), label: `Daily` },
  { value: String(RruleFreq.Weekly), label: `Weekly` },
  { value: String(RruleFreq.Monthly), label: `Monthly` },
  { value: String(RruleFreq.Yearly), label: `Yearly` },
]

const UNIT: Record<RruleFreq, string> = {
  [RruleFreq.Daily]: `day`,
  [RruleFreq.Weekly]: `week`,
  [RruleFreq.Monthly]: `month`,
  [RruleFreq.Yearly]: `year`,
}

/** Whether the screen can show a rule as a frequency and an interval and write it back whole. */
function isPlain(rule: Rrule): boolean {
  return rule.byDay.length === 0 && rule.byMonthDay.length === 0 && rule.byMonth.length === 0 &&
    rule.count === undefined && rule.until === undefined &&
    rule.weekStart === RruleWeekday.Monday
}

function write(freq: RruleFreq, interval: number): string | null {
  const text = formatRrule({
    freq,
    interval,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    weekStart: RruleWeekday.Monday,
  })
  return text.success ? text.output : null
}

/**
 * The repeat control: a choice of none, daily, weekly, monthly or yearly, and "every N" units. A
 * rule the control cannot build (weekdays, an end date, a count, a month day) is read from the
 * task, shown in words as the selected "Custom" choice and passed through untouched until the
 * person picks one of the others.
 */
export function RepeatField(
  { id, value, onChange, error, disabled }: RepeatFieldProps,
): JSX.Element {
  const parsed = value ? parseRrule(value) : undefined
  const rule = parsed?.success ? parsed.output : undefined
  const plain = rule && isPlain(rule) ? rule : undefined
  const mode = !value ? NONE : plain ? String(plain.freq) : CUSTOM
  const interval = plain?.interval ?? rule?.interval ?? 1
  const [text, setText] = useState(String(interval))
  useEffect(() => setText(String(interval)), [interval])

  const customLabel = rule ? describeRrule(rule) : value
  const options = [
    { value: NONE, label: `Does not repeat` },
    ...(mode === CUSTOM ? [{ value: CUSTOM, label: `Custom: ${customLabel}` }] : []),
    ...FREQ_OPTIONS,
  ]

  const pick = (next: string) => {
    if (next === NONE) return onChange(null)
    if (next === CUSTOM) return
    onChange(write(Number(next) as RruleFreq, interval))
  }

  const setInterval = (next: string) => {
    setText(next)
    const count = Number(next)
    if (plain && Number.isInteger(count) && count >= 1 && count <= 999) {
      onChange(write(plain.freq, count))
    }
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
        <div class="flex items-end gap-3">
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
      {mode === CUSTOM && (
        <p class="flex items-center gap-2 text-sm text-muted">
          <IconArrowPath class="size-4" aria-hidden="true" />
          <span data-e2e="task-repeat-label">{customLabel}</span>
        </p>
      )}
    </div>
  )
}
