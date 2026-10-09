import { relativeDayLabel } from "@spy4x/time/locale"
import { hhmmInTz, isoDateInTz } from "@spy4x/time/tz"
import { IcalDateKind } from "@spy4x/time/ical"
import { dateDay, dateInstant, type TaskDate } from "@spy4x/time/ical-tasks-model"
import { isOverdue } from "@spy4x/platform/universal/ical-tasks-view"

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
  return { text: `${relativeDayLabel(day, today)}${time}`, tone }
}

/**
 * A due time typed as a wall clock (`HH:MM`) on a day: floating, so it reads the same on every
 * device. The task editor and quick add both write a new time this way.
 */
export function floatingDue(date: string, time: string): TaskDate {
  return { kind: IcalDateKind.Floating, date, time: `${time}:00` }
}
