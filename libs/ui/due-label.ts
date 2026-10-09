import { addDays, formatDateTimeShort, hhmmInTz, isoDateInTz } from "@spy4x/time/tz"
import { IcalDateKind } from "@spy4x/time/ical"
import { dateDay, dateInstant } from "../tasks/model.ts"
import { isOverdue } from "../tasks/views.ts"
import type { TaskDate } from "../tasks/types.ts"

/** How a due value should be coloured: late, due today, or neither. */
export enum DueTone {
  Normal = 1,
  Today,
  Overdue,
}

/** The words a row shows for a due value, and how to colour them. */
export interface DueLabel {
  /** `Today 14:30`, `Tomorrow`, `Thu 15 Oct`. */
  text: string
  tone: DueTone
}

/**
 * A day as a person says it: `Yesterday`, `Today`, `Tomorrow`, otherwise `Thu 15 Oct`. `date` and
 * `today` are `YYYY-MM-DD` in the viewer's `zone`.
 *
 * TODO(spy4x/ts-libs): `@spy4x/time` has no date-only short form, so the weekday-and-day text is
 * `formatDateTimeShort` at noon (never a skipped hour) without its time. Replace this with the
 * library's own once it ships one.
 */
export function dayLabel(date: string, today: string, zone: string): string {
  if (date === today) return `Today`
  if (date === addDays(today, 1)) return `Tomorrow`
  if (date === addDays(today, -1)) return `Yesterday`
  return formatDateTimeShort(date, `12:00`, zone).replace(/ \d{2}:\d{2}$/, ``)
}

/** The label of a task's due value for a viewer in `zone`: the day, then the time if it has one. */
export function dueLabel(due: TaskDate, now: Date, zone: string): DueLabel {
  const today = isoDateInTz(now, zone)
  const day = dateDay(due, zone)
  const time = due.kind === IcalDateKind.Date ? `` : ` ${hhmmInTz(dateInstant(due, zone), zone)}`
  const tone = isOverdue(due, now, zone)
    ? DueTone.Overdue
    : day === today
    ? DueTone.Today
    : DueTone.Normal
  return { text: `${dayLabel(day, today, zone)}${time}`, tone }
}
