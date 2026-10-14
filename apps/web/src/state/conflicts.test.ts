/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { addDays, isoDateInTz } from "@spy4x/time/tz"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { browserZone } from "../views/clock.ts"
import { conflicts, keepMineOf } from "./conflicts.ts"
import { getOutbox } from "./outbox.ts"
import { pendingEntries } from "./pending.ts"
import { refresh } from "./sync.ts"
import { setTaskDone, tasks } from "./tasks.ts"
import { type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-14T10:00:00.000Z`)

Deno.test(`keeping mine after an offline tick of a task that counts from completion completes the other device's daily version from the completion day`, async () => {
  await withApp(async (server: FakeServer) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(
      HREF,
      LIST_HREF,
      fixture(`1`, `Water plants`, [
        `DUE;VALUE=DATE:20261001`,
        `RRULE:FREQ=WEEKLY`,
        `X-REPEAT-FROM:COMPLETION`,
      ]),
    )
    await refresh()
    setBrowserOnline(false)
    await setTaskDone(tasks.value[0], true, NOW)
    const found = server.objects.get(HREF)!
    server.objects.set(HREF, {
      ...found,
      etag: server.nextEtag(),
      ics: found.ics.replace(`RRULE:FREQ=WEEKLY`, `RRULE:FREQ=DAILY`),
    })
    setBrowserOnline(true)
    await getOutbox().flush()
    expect(conflicts.value.map((c) => c.reason)).toEqual([`version`])

    expect(await keepMineOf(conflicts.value[0].id, NOW)).toBeNull()

    // The other device made it daily, so the tick lands a day after the day it was made, as the
    // person's own zone reads that day.
    const next = addDays(isoDateInTz(NOW, browserZone()), 1).replaceAll(`-`, ``)
    const onServer = server.objects.get(HREF)!.ics
    expect(onServer).toContain(`DUE;VALUE=DATE:${next}`)
    expect(onServer).toContain(`RRULE:FREQ=DAILY`)
    expect(onServer).toContain(`X-REPEAT-FROM:COMPLETION`)
    expect(pendingEntries.value).toEqual([])
  })
})
