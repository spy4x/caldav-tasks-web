/**
 * Tasks written the way Tasks.org writes them to Stalwart 0.16: its `PRODID`, `RELATED-TO` with no
 * `RELTYPE`, `X-APPLE-SORT-ORDER`, a default `VALARM` and `DUE;VALUE=DATE` for a date. The shapes
 * come from the captures in `ts-libs/time/testdata/ical`. The text is made up: no title, note, tag
 * or UID is a real one.
 *
 * `MANUAL_ORDER` is the order the "Errands" list has when sorted manually, the way Tasks.org
 * sorts it: ascending `X-APPLE-SORT-ORDER`; a task without one sits at its creation time in
 * seconds since 2001-01-01 (`CREATED`, or `DTSTAMP` when there is none), and ties go by title.
 * "Call the plumber" comes last only because it was created after the others' positions. The
 * order is written down by hand from those numbers; it was not read off a Tasks.org screen.
 */

import { parseTask } from "@spy4x/time/ical-tasks-model"
import type { Task } from "@spy4x/time/ical-tasks-model"

export const LIST_HREF = `/dav/tasks/errands/`

/** Reads fixture text into a task, and throws when the text does not parse. */
export function fixtureTask(ics: string): Task {
  const result = parseTask({ href: `${LIST_HREF}x.ics`, etag: `"1"`, listHref: LIST_HREF, ics })
  if (!result.success) throw new Error(result.error)
  return result.output
}

export function vtodo(lines: string[], extra: string[] = []): string {
  return [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:+//IDN tasks.org//android-150904//EN`,
    `BEGIN:VTODO`,
    ...lines,
    `BEGIN:VALARM`,
    `TRIGGER;RELATED=END:PT0S`,
    `ACTION:DISPLAY`,
    `DESCRIPTION:Default Tasks.org description`,
    `END:VALARM`,
    `END:VTODO`,
    ...extra,
    `END:VCALENDAR`,
    ``,
  ].join(`\r\n`)
}

const STAMPS = [`DTSTAMP:20261001T080000Z`, `CREATED:20260930T080000Z`]

/** One Tasks.org VTODO with `uid`, `summary` and any further property lines. */
export function task(uid: string, summary: string, rest: string[] = []): string {
  return vtodo([...STAMPS, `UID:${uid}`, `SUMMARY:${summary}`, ...rest])
}

const HO_CHI_MINH = [
  `BEGIN:VTIMEZONE`,
  `TZID:Asia/Ho_Chi_Minh`,
  `BEGIN:STANDARD`,
  `TZNAME:+07`,
  `TZOFFSETFROM:+0700`,
  `TZOFFSETTO:+0700`,
  `DTSTART:19700101T000000`,
  `END:STANDARD`,
  `END:VTIMEZONE`,
]

/** The "Errands" list, by `UID`. */
export const ERRANDS: Record<string, string> = {
  "100200300": task(`100200300`, `Plan the garden`, [`X-APPLE-SORT-ORDER:792512100`]),
  "100200301": task(`100200301`, `Buy seeds`, [
    `PRIORITY:1`,
    `RELATED-TO:100200300`,
    `X-APPLE-SORT-ORDER:792512300`,
  ]),
  "100200302": task(`100200302`, `Clear the beds`, [
    `PRIORITY:5`,
    `RELATED-TO:100200300`,
    `X-APPLE-SORT-ORDER:792512200`,
  ]),
  "100200303": task(`100200303`, `Water the plants`, [
    `DUE;VALUE=DATE:20261009`,
    `X-APPLE-SORT-ORDER:-12`,
  ]),
  "100200304": task(`100200304`, `Call the plumber`, [`DUE;VALUE=DATE:20261012`]),
  "100200305": task(`100200305`, `Fix the gate`, [
    `RELATED-TO:100200999`,
    `X-APPLE-SORT-ORDER:792512000`,
  ]),
  "100200306": task(`100200306`, `Cycle one`, [
    `RELATED-TO:100200307`,
    `X-APPLE-SORT-ORDER:792513000`,
  ]),
  "100200307": task(`100200307`, `Cycle two`, [
    `RELATED-TO:100200306`,
    `X-APPLE-SORT-ORDER:792513100`,
  ]),
}

/** The `UID`s of {@link ERRANDS} in manual order. */
export const MANUAL_ORDER = [
  `100200303`,
  `100200305`,
  `100200300`,
  `100200302`,
  `100200301`,
  `100200306`,
  `100200307`,
  `100200304`,
]

/**
 * Three tasks in the "Creation" list. Two were never dragged (no `X-APPLE-SORT-ORDER`) and one was
 * dragged to a position between their creation times (Apple seconds: 2026-09-30T08:00Z is
 * 812448000, 2026-10-01T08:00Z is 812534400, 2026-10-02T08:00Z is 812620800). Tasks.org places a
 * never-dragged task at its creation time, so the order is `100200400`, `100200402`, `100200401`.
 * Putting such tasks last, then by title, would give `100200402`, `100200401`, `100200400`.
 */
export const CREATION: Record<string, string> = {
  "100200400": vtodo([
    `DTSTAMP:20261003T000000Z`,
    `CREATED:20260930T080000Z`,
    `UID:100200400`,
    `SUMMARY:Zebra stall`,
  ]),
  "100200401": vtodo([
    `DTSTAMP:20261003T000000Z`,
    `CREATED:20261002T080000Z`,
    `UID:100200401`,
    `SUMMARY:Apple stall`,
  ]),
  "100200402": vtodo([
    `DTSTAMP:20261003T000000Z`,
    `CREATED:20260901T080000Z`,
    `UID:100200402`,
    `SUMMARY:Mango stall`,
    `X-APPLE-SORT-ORDER:812534400`,
  ]),
}

/** The `UID`s of {@link CREATION} in manual order. */
export const CREATION_MANUAL_ORDER = [`100200400`, `100200402`, `100200401`]

/** A never-dragged task with no `CREATED`, only a `DTSTAMP` of 2026-10-01T08:00Z (812534400). */
export const STAMP_ONLY = vtodo([
  `DTSTAMP:20261001T080000Z`,
  `UID:100200410`,
  `SUMMARY:Stamp only`,
])

/** One task per kind of due value, all with the same wall clock: 23:30 on 2026-10-08. */
export const DUE_KINDS = {
  date: task(`100200310`, `Due as a date`, [`DUE;VALUE=DATE:20261008`]),
  floating: task(`100200311`, `Due at a floating time`, [`DUE:20261008T233000`]),
  utc: task(`100200312`, `Due at a UTC time`, [`DUE:20261008T233000Z`]),
  zoned: vtodo(
    [
      ...STAMPS,
      `UID:100200313`,
      `SUMMARY:Due at a Ho Chi Minh time`,
      `DUE;TZID=Asia/Ho_Chi_Minh:20261008T233000`,
    ],
    HO_CHI_MINH,
  ),
}

/** A daily task with a zone, a tag, a priority and notes, the way Tasks.org writes one. */
export const RECURRING = vtodo(
  [
    ...STAMPS,
    `UID:100200320`,
    `SUMMARY:Stretch before breakfast`,
    `DESCRIPTION:Ten minutes\\, no phone`,
    `PRIORITY:1`,
    `STATUS:NEEDS-ACTION`,
    `RRULE:FREQ=DAILY;INTERVAL=1`,
    `CATEGORIES:health,morning`,
    `X-APPLE-SORT-ORDER:783013311`,
    `DUE;TZID=Asia/Ho_Chi_Minh:20261008T070000`,
  ],
  HO_CHI_MINH,
)

/** A finished task, which the views leave out. */
export const COMPLETED = task(`100200330`, `Return the library book`, [
  `STATUS:COMPLETED`,
  `COMPLETED:20261007T120000Z`,
  `PERCENT-COMPLETE:100`,
  `DUE;VALUE=DATE:20261007`,
])
