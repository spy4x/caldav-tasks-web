/// <reference lib="deno.ns" />
/// <reference lib="es2022" />
/**
 * The made-up task lists the caldav-tasks-web demo clip shows, written straight
 * to a throwaway Radicale the way Tasks.org writes them: its `PRODID`,
 * `RELATED-TO` for a subtask, `X-APPLE-SORT-ORDER`, a default `VALARM` and
 * `DUE;VALUE=DATE` for a date (the shapes of caldav-tasks-web's
 * `libs/tasks/fixtures/tasksorg.ts`). Every title is invented; nothing comes
 * from a real account. Dates are relative to the day of the run, so a
 * re-recording shows the same overdue and due-today groups.
 */

/** One list and its tasks, as CalDAV property lines after the title. */
interface DemoList {
  name: string
  /** `#RRGGBB`; written as Apple's `calendar-color`. */
  color: string
  tasks: { uid: string; summary: string; lines: string[] }[]
}

/** `YYYYMMDD` for the UTC day `offset` days from `today`. */
function day(today: Date, offset: number): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10).replaceAll("-", "")
}

/** The three lists of the clip, with dates counted from `today`. */
export function demoLists(today: Date): DemoList[] {
  const due = (offset: number) => `DUE;VALUE=DATE:${day(today, offset)}`
  return [
    {
      name: "Errands",
      color: "#E07A3F",
      tasks: [
        {
          uid: "100200300",
          summary: "Plan the garden",
          lines: [due(0), "X-APPLE-SORT-ORDER:792512100"],
        },
        {
          uid: "100200301",
          summary: "Buy seeds",
          lines: [
            "PRIORITY:1",
            "RELATED-TO:100200300",
            "X-APPLE-SORT-ORDER:792512200",
          ],
        },
        {
          uid: "100200302",
          summary: "Clear the beds",
          lines: [
            "PRIORITY:5",
            "RELATED-TO:100200300",
            "X-APPLE-SORT-ORDER:792512300",
          ],
        },
        {
          uid: "100200303",
          summary: "Water the plants",
          lines: [due(0), "X-APPLE-SORT-ORDER:-12"],
        },
        {
          uid: "100200304",
          summary: "Call the plumber",
          lines: [due(-1), "PRIORITY:5"],
        },
      ],
    },
    {
      name: "Home",
      color: "#6FA37B",
      tasks: [
        {
          uid: "100200310",
          summary: "Fix the gate",
          lines: [due(-2), "PRIORITY:1"],
        },
        {
          uid: "100200311",
          summary: "Renew the library card",
          lines: [due(0), "CATEGORIES:town"],
        },
        { uid: "100200312", summary: "Sort the bookshelf", lines: [] },
      ],
    },
    {
      name: "Studio",
      color: "#7C93C9",
      tasks: [
        {
          uid: "100200320",
          summary: "Send the invoice to Example Co",
          lines: [due(0), "PRIORITY:5", "CATEGORIES:billing"],
        },
        {
          uid: "100200321",
          summary: "Review the logo drafts",
          lines: [due(3)],
        },
      ],
    },
  ]
}

/** One Tasks.org VTODO: the property lines Tasks.org writes, plus a default reminder. */
function vtodo(uid: string, summary: string, lines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:+//IDN tasks.org//android-150904//EN",
    "BEGIN:VTODO",
    "DTSTAMP:20261001T080000Z",
    "CREATED:20260930T080000Z",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    ...lines,
    "BEGIN:VALARM",
    "TRIGGER;RELATED=END:PT0S",
    "ACTION:DISPLAY",
    "DESCRIPTION:Default Tasks.org description",
    "END:VALARM",
    "END:VTODO",
    "END:VCALENDAR",
    "",
  ].join("\r\n")
}

/** Sends one CalDAV request and throws, naming the status, unless it is in `ok`. */
async function caldav(
  auth: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  ok: number[],
): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: auth, ...headers },
    body,
  })
  const text = await response.text()
  if (!ok.includes(response.status)) {
    throw new Error(`${method} ${url} answered ${response.status}: ${text}`)
  }
}

/** Creates (or recreates) the demo lists and tasks for `user` on the Radicale at `base`. */
export async function seed(
  base: string,
  user: string,
  today = new Date(),
): Promise<void> {
  // Radicale here runs with `--auth-type none`: any password works.
  const auth = `Basic ${btoa(`${user}:demo`)}`
  for (const [i, list] of demoLists(today).entries()) {
    const href = `${base}/${user}/list-${i + 1}/`
    // A rerun starts from the same lists: drop what an earlier take changed.
    await caldav(auth, "DELETE", href, {}, "", [200, 204, 404])
    await caldav(
      auth,
      "MKCALENDAR",
      href,
      { "Content-Type": "application/xml; charset=utf-8" },
      `<?xml version="1.0" encoding="utf-8"?>
<C:mkcalendar xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <set><prop>
    <displayname>${list.name}</displayname>
    <A:calendar-color>${list.color}FF</A:calendar-color>
    <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
  </prop></set>
</C:mkcalendar>`,
      [201],
    )
    for (const task of list.tasks) {
      await caldav(
        auth,
        "PUT",
        `${href}${task.uid}.ics`,
        {
          "Content-Type": "text/calendar; charset=utf-8",
          "If-None-Match": "*",
        },
        vtodo(task.uid, task.summary, task.lines),
        [201],
      )
    }
  }
}

if (import.meta.main) {
  const [base, user] = Deno.args
  if (!base || !user) throw new Error("usage: seed.ts <radicale-url> <user>")
  await seed(base, user)
}
