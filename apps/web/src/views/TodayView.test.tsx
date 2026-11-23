/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { withApp } from "../state/testing.ts"
import { refresh } from "../state/sync.ts"
import { tasks } from "../state/tasks.ts"
import { toasts } from "../state/toasts.ts"
import { nestOnToday } from "./TodayView.tsx"

const todo = (uid: string, title: string) =>
  [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:test`,
    `BEGIN:VTODO`,
    `UID:${uid}`,
    `DTSTAMP:20261001T000000Z`,
    `SUMMARY:${title}`,
    `STATUS:NEEDS-ACTION`,
    `END:VTODO`,
    `END:VCALENDAR`,
    ``,
  ].join(`\r\n`)

Deno.test(`a drag on Today nests a task under one of its own list, and refuses another list's`, async () => {
  await withApp(async (server) => {
    const home = `/dav/tasks/home/`
    const work = `/dav/tasks/work/`
    server.calendarList = [
      { href: home, displayName: `Home`, changeMarker: `c1` },
      { href: work, displayName: `Work`, changeMarker: `c1` },
    ]
    server.seed(`${home}a.ics`, home, todo(`a`, `Groceries`))
    server.seed(`${home}b.ics`, home, todo(`b`, `Milk`))
    server.seed(`${work}c.ics`, work, todo(`c`, `Report`))
    await refresh()
    const task = (uid: string) => tasks.value.find((each) => each.uid === uid)!

    await nestOnToday(task(`b`), task(`c`), `UTC`)
    expect(task(`b`).parentUid).toBeUndefined()
    expect(toasts.list.value.at(-1)?.body).toBe(`Only tasks in the same list can be nested.`)

    await nestOnToday(task(`b`), task(`a`), `UTC`)
    const milk = server.objects.get(`${home}b.ics`)?.ics ?? ``
    expect(milk).toContain(`RELATED-TO`)
    expect(milk).toContain(`:a`)
  })
})
