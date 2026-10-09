import { expect, type Page, test } from "@playwright/test"
import { CALDAV_PATHS } from "../libs/api/caldav.ts"
import { CALDAV_PASSWORD } from "./env.ts"
import { deleteList, readTask, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

/** What one relay call answered: the status and the body as text. */
interface Answer {
  status: number
  text: string
}

/** Calls the relay from the signed-in page, as the app does, with the page's own cookie. */
async function relay(page: Page, path: string, method = `GET`, body?: unknown): Promise<Answer> {
  const answer = await page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": `application/json` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, text: await response.text() }
  }, { path, method, body })
  // The CalDAV password stays on the server, whatever the route answers.
  expect(answer.text).not.toContain(CALDAV_PASSWORD)
  return answer
}

function task(uid: string, lines: string[]): string {
  return [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:-//caldav-tasks-web//e2e//EN`,
    `BEGIN:VTODO`,
    `UID:${uid}`,
    `DTSTAMP:20261008T090000Z`,
    ...lines,
    `END:VTODO`,
    `END:VCALENDAR`,
    ``,
  ].join(`\r\n`)
}

let list: SeededList

test.beforeEach(async ({ page }) => {
  list = await seedTaskList(`Relay task`)
  await signIn(page)
})

test.afterEach(async () => await deleteList(list))

test("lists the task lists on Radicale and a list's open tasks, completed ones on request", async ({ page }) => {
  const calendarHref = new URL(list.calendarUrl).pathname
  const taskHref = new URL(list.taskUrl).pathname

  const calendars = await relay(page, CALDAV_PATHS.calendars)
  expect(calendars.status).toBe(200)
  const listed = JSON.parse(calendars.text).calendars
  expect(listed).toContainEqual(
    expect.objectContaining({ href: calendarHref, components: [`VTODO`] }),
  )

  const done = await relay(page, CALDAV_PATHS.objects, `POST`, {
    calendar: calendarHref,
    ics: task(crypto.randomUUID(), [
      `SUMMARY:Done task`,
      `STATUS:COMPLETED`,
      `COMPLETED:20261008T100000Z`,
    ]),
  })
  expect(done.status).toBe(201)
  const doneHref = JSON.parse(done.text).href
  expect(doneHref.startsWith(calendarHref)).toBe(true)

  const query = `${CALDAV_PATHS.objects}?calendar=${encodeURIComponent(calendarHref)}`
  const open = await relay(page, query)
  expect(open.status).toBe(200)
  const openObjects = JSON.parse(open.text).objects
  expect(openObjects.map((object: { href: string }) => object.href)).toEqual([taskHref])
  expect(openObjects[0].ics).toContain(`SUMMARY:Relay task`)
  expect(openObjects[0].etag).toMatch(/^(W\/)?".+"$/)

  const all = await relay(page, `${query}&completed=true`)
  const allHrefs = JSON.parse(all.text).objects.map((object: { href: string }) => object.href)
  expect(allHrefs.sort()).toEqual([taskHref, doneHref].sort())
})

test("an update with a stale etag answers 412 conflict and the task stays as it was", async ({ page }) => {
  const href = new URL(list.taskUrl).pathname
  const read = await relay(page, `${CALDAV_PATHS.object}?href=${encodeURIComponent(href)}`)
  expect(read.status).toBe(200)
  const { etag: firstEtag } = JSON.parse(read.text)

  const fresh = await relay(page, CALDAV_PATHS.object, `PUT`, {
    href,
    etag: firstEtag,
    ics: task(list.uid, [`SUMMARY:Edited in the app`]),
  })
  expect(fresh.status).toBe(200)
  expect(JSON.parse(fresh.text).etag).not.toBe(firstEtag)

  const stale = await relay(page, CALDAV_PATHS.object, `PUT`, {
    href,
    etag: firstEtag,
    ics: task(list.uid, [`SUMMARY:Edited from a stale copy`]),
  })
  expect(stale.status).toBe(412)
  expect(JSON.parse(stale.text).code).toBe(`conflict`)
  const stored = await readTask(list.taskUrl)
  expect(stored).toContain(`SUMMARY:Edited in the app`)
  expect(stored).not.toContain(`stale copy`)

  const staleDelete = await relay(page, CALDAV_PATHS.object, `DELETE`, { href, etag: firstEtag })
  expect(staleDelete.status).toBe(412)
  expect(await readTask(list.taskUrl)).toContain(`SUMMARY:Edited in the app`)
})

test("refuses a task outside the listed calendars", async ({ page }) => {
  const elsewhere = `/someone-else/${crypto.randomUUID()}/a.ics`
  const answer = await relay(page, `${CALDAV_PATHS.object}?href=${encodeURIComponent(elsewhere)}`)
  expect(answer.status).toBe(400)
  expect(JSON.parse(answer.text).code).toBe(`bad_request`)
})
