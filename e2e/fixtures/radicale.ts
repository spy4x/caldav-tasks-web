import { CALDAV_PASSWORD, CALDAV_USERNAME, RADICALE_URL } from "../env.ts"

/** A task list the fixture created on Radicale, with the one task in it. */
export interface SeededList {
  /** The calendar's address on Radicale. */
  calendarUrl: string
  /** The task's address on Radicale. */
  taskUrl: string
  uid: string
  title: string
}

function authorization(): string {
  return `Basic ${btoa(`${CALDAV_USERNAME}:${CALDAV_PASSWORD}`)}`
}

/** Sends a CalDAV request to Radicale and throws, naming the status, unless it is in `ok`. */
async function caldav(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  ok: number[],
): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: authorization(), ...headers },
    body,
  })
  if (!ok.includes(response.status)) {
    throw new Error(`${method} ${url} answered ${response.status}: ${await response.text()}`)
  }
  return response
}

/**
 * Creates a fresh task list (a calendar that accepts VTODOs) on Radicale with one task, under a
 * name no other run uses, so runs never see each other's data.
 */
export async function seedTaskList(
  title = `Seeded task`,
  extraLines: string[] = [],
): Promise<SeededList> {
  const id = crypto.randomUUID()
  const calendarUrl = `${RADICALE_URL}/${CALDAV_USERNAME}/${id}/`
  await caldav(
    `MKCALENDAR`,
    calendarUrl,
    { "Content-Type": `application/xml; charset=utf-8` },
    `<?xml version="1.0" encoding="utf-8"?>
<C:mkcalendar xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <set><prop>
    <displayname>E2E ${id}</displayname>
    <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
  </prop></set>
</C:mkcalendar>`,
    [201],
  )
  const uid = crypto.randomUUID()
  const taskUrl = `${calendarUrl}${uid}.ics`
  await caldav(
    `PUT`,
    taskUrl,
    { "Content-Type": `text/calendar; charset=utf-8`, "If-None-Match": `*` },
    [
      `BEGIN:VCALENDAR`,
      `VERSION:2.0`,
      `PRODID:-//caldav-tasks-web//e2e//EN`,
      `BEGIN:VTODO`,
      `UID:${uid}`,
      `DTSTAMP:20261008T090000Z`,
      `SUMMARY:${title}`,
      `STATUS:NEEDS-ACTION`,
      ...extraLines,
      `END:VTODO`,
      `END:VCALENDAR`,
      ``,
    ].join(`\r\n`),
    [201],
  )
  return { calendarUrl, taskUrl, uid, title }
}

/** Adds one more task to a seeded list and returns its address on Radicale. */
export async function addSeededTask(
  list: SeededList,
  title: string,
  extraLines: string[] = [],
): Promise<string> {
  const uid = crypto.randomUUID()
  const taskUrl = `${list.calendarUrl}${uid}.ics`
  await caldav(
    `PUT`,
    taskUrl,
    { "Content-Type": `text/calendar; charset=utf-8`, "If-None-Match": `*` },
    [
      `BEGIN:VCALENDAR`,
      `VERSION:2.0`,
      `PRODID:-//caldav-tasks-web//e2e//EN`,
      `BEGIN:VTODO`,
      `UID:${uid}`,
      `DTSTAMP:20261008T090000Z`,
      `SUMMARY:${title}`,
      `STATUS:NEEDS-ACTION`,
      ...extraLines,
      `END:VTODO`,
      `END:VCALENDAR`,
      ``,
    ].join(`\r\n`),
    [201],
  )
  return taskUrl
}

/** Reads a task back from Radicale as iCalendar text. */
export async function readTask(taskUrl: string): Promise<string> {
  const response = await fetch(taskUrl, { headers: { Authorization: authorization() } })
  if (!response.ok) throw new Error(`GET ${taskUrl} answered ${response.status}`)
  return await response.text()
}

/** Reads every task of a list from Radicale as one iCalendar text. */
export async function readList(list: SeededList): Promise<string> {
  return await readTask(list.calendarUrl)
}

/** Deletes a list the fixture created, so a run leaves Radicale as it found it. */
export async function deleteList(list: SeededList): Promise<void> {
  await caldav(`DELETE`, list.calendarUrl, {}, ``, [200, 204, 404])
}
