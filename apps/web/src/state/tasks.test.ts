/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { completeTask } from "@tasks/complete.ts"
import { EditField } from "@tasks/edit.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { TaskStatus } from "@tasks/types.ts"
import { notice, OFFLINE_NOTICE } from "./connection.ts"
import { cacheUnavailable, getStorage, useStorage } from "./db.ts"
import { refresh } from "./sync.ts"
import { keepMineAfterConflict, saveTask, setTaskDone, tasks, WriteKind } from "./tasks.ts"
import { error, type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-09T10:00:00.000Z`)

/** One task on the server and in the cache, with a vendor line that must survive every edit. */
async function start(server: FakeServer) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(
    HREF,
    LIST_HREF,
    fixture(`1`, `Buy milk`, [`DESCRIPTION:Two litres`, `X-VENDOR:keep me`]),
  )
  await refresh()
  server.sent.length = 0
  return tasks.value[0]
}

/** Another client edits the task on the server, as Tasks.org on the phone would. */
function editElsewhere(server: FakeServer, from: string, to: string) {
  const found = server.objects.get(HREF)!
  server.objects.set(HREF, {
    ...found,
    etag: server.nextEtag(),
    ics: found.ics.replace(from, to),
  })
}

const puts = (server: FakeServer) => server.count(`PUT`, CALDAV_PATHS.object)

Deno.test(`a saved edit sends the etag it was read with and caches the new text and etag`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)

    const body = server.objects.get(HREF)!
    expect(body.ics).toContain(`SUMMARY:Buy oat milk`)
    expect(body.ics).toContain(`X-VENDOR:keep me`)
    expect(result.task.etag).toBe(body.etag)
    expect(tasks.value[0].title).toBe(`Buy oat milk`)
    const cached = (await getStorage().listTasks())[0]
    expect(cached.ics).toBe(body.ics)
    expect(cached.etag).toBe(body.etag)
  })
})

Deno.test(`a write while offline is refused with the notice and nothing is sent`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    const result = await saveTask(before, { title: `Changed` }, NOW)
    expect(result).toEqual({ kind: WriteKind.Offline, notice: OFFLINE_NOTICE })
    expect(server.sent).toEqual([])
    // Never queued: going online again sends nothing by itself.
    setBrowserOnline(true)
    expect(server.sent).toEqual([])
    expect(tasks.value[0].title).toBe(`Buy milk`)
  })
})

Deno.test(`a write that gets no answer is refused as offline and the cached task is unchanged`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    server.down = true
    const result = await saveTask(before, { title: `Changed` }, NOW)
    expect(result.kind).toBe(WriteKind.Offline)
    expect(notice.value).toBe(OFFLINE_NOTICE)
    expect(tasks.value[0].title).toBe(`Buy milk`)
    expect((await getStorage().listTasks())[0].ics).toBe(before.ics)
  })
})

Deno.test(`a 412 on save rebases the edit onto the fresh copy and retries once`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    editElsewhere(server, `DESCRIPTION:Two litres`, `DESCRIPTION:Three litres`)

    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    const onServer = server.objects.get(HREF)!.ics
    expect(onServer).toContain(`SUMMARY:Buy oat milk`)
    expect(onServer).toContain(`DESCRIPTION:Three litres`)
    expect(puts(server)).toBe(2)
    expect(server.count(`GET`, CALDAV_PATHS.object)).toBe(1)
    expect(tasks.value[0].notes).toBe(`Three litres`)
  })
})

Deno.test(`a 412 where both sides changed the same field reaches the caller as a conflict`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    editElsewhere(server, `SUMMARY:Buy milk`, `SUMMARY:Buy cheese`)

    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)

    if (result.kind !== WriteKind.Conflict) throw new Error(`expected conflict, got ${result.kind}`)
    expect(result.conflict.fields).toEqual([EditField.Title])
    expect(result.conflict.theirs.title).toBe(`Buy cheese`)
    // Only the refused first attempt was sent; the server's copy is shown meanwhile.
    expect(puts(server)).toBe(1)
    expect(tasks.value[0].title).toBe(`Buy cheese`)
  })
})

Deno.test(`keeping mine after a conflict writes the edit over the server's copy`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    editElsewhere(server, `SUMMARY:Buy milk`, `SUMMARY:Buy cheese`)
    editElsewhere(server, `DESCRIPTION:Two litres`, `DESCRIPTION:Three litres`)
    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)
    if (result.kind !== WriteKind.Conflict) throw new Error(`expected conflict`)

    const kept = await keepMineAfterConflict(result.conflict, NOW)

    expect(kept.kind).toBe(WriteKind.Saved)
    const onServer = server.objects.get(HREF)!.ics
    expect(onServer).toContain(`SUMMARY:Buy oat milk`)
    expect(onServer).toContain(`DESCRIPTION:Three litres`)
  })
})

Deno.test(`a second 412 after the retry stops and says the task changed again`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    editElsewhere(server, `DESCRIPTION:Two litres`, `DESCRIPTION:Three litres`)
    // The task changes again between the fresh read and the retry.
    let puttings = 0
    server.beforePut = () => {
      if (++puttings === 2) editElsewhere(server, `Three litres`, `Four litres`)
    }

    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)

    expect(result).toEqual({
      kind: WriteKind.Failed,
      message: `The task changed again while saving. Try again.`,
    })
    expect(puts(server)).toBe(2)
  })
})

Deno.test(`completing a task whose copy is stale completes the fresh copy`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    editElsewhere(server, `DESCRIPTION:Two litres`, `DESCRIPTION:Three litres`)

    const result = await setTaskDone(before, true, NOW)

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.task.status).toBe(TaskStatus.Completed)
    expect(server.objects.get(HREF)!.ics).toContain(`DESCRIPTION:Three litres`)
    expect(puts(server)).toBe(2)
  })
})

Deno.test(`a refused CalDAV account fails the write with the server's message and the status in the notice`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    server.next = error(502, `caldav_refused`, `The CalDAV server refused the account.`)

    const result = await saveTask(before, { title: `Changed` }, NOW)

    expect(result).toEqual({
      kind: WriteKind.Failed,
      message: `The CalDAV server refused the account.`,
    })
    expect(notice.value).toContain(`(502)`)
  })
})

Deno.test(`moving a task to another list is refused until it is supported`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const result = await saveTask(before, { listHref: `/dav/tasks/other/` }, NOW)
    expect(result.kind).toBe(WriteKind.Failed)
    expect(server.sent).toEqual([])
  })
})

Deno.test(`completing a repeating task that the phone completed first advances it once`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(
      HREF,
      LIST_HREF,
      fixture(`1`, `Water plants`, [`DUE;VALUE=DATE:20261009`, `RRULE:FREQ=DAILY`]),
    )
    await refresh()
    server.sent.length = 0
    const before = tasks.value[0]
    // The phone completes it first: due moves to 10 October.
    const phone = completeTask(before, NOW)
    if (!phone.success) throw new Error(phone.error.message)
    const found = server.objects.get(HREF)!
    server.objects.set(HREF, { ...found, etag: server.nextEtag(), ics: phone.output.ics })

    const result = await setTaskDone(before, true, NOW)

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(server.objects.get(HREF)!.ics).toBe(phone.output.ics)
    expect(result.task.due).toEqual(phone.output.task.due)
    // Only the refused first attempt was sent: nothing completed it a second time.
    expect(puts(server)).toBe(1)
  })
})

Deno.test(`completing a repeating task that the phone rescheduled is not taken as already done`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(
      HREF,
      LIST_HREF,
      fixture(`1`, `Water plants`, [`DUE;VALUE=DATE:20261009`, `RRULE:FREQ=DAILY`]),
    )
    await refresh()
    server.sent.length = 0
    const before = tasks.value[0]
    // The phone moves it to 15 October without completing it.
    editElsewhere(server, `DUE;VALUE=DATE:20261009`, `DUE;VALUE=DATE:20261015`)

    const result = await setTaskDone(before, true, NOW)

    expect(result.kind).toBe(WriteKind.Failed)
    expect(server.objects.get(HREF)!.ics).toContain(`DUE;VALUE=DATE:20261015`)
  })
})

Deno.test(`a save the server accepted is reported saved even when the cache cannot store it`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const storage = getStorage()
    useStorage({
      ...storage,
      putTask: () => Promise.reject(new DOMException(`full`, `QuotaExceededError`)),
    })

    const result = await saveTask(before, { title: `Buy oat milk` }, NOW)

    expect(result.kind).toBe(WriteKind.Saved)
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Buy oat milk`)
    expect(tasks.value[0].title).toBe(`Buy oat milk`)
    expect(cacheUnavailable.value).toBe(true)
  })
})

Deno.test(`completing a task that someone else already completed sends nothing more`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const phone = completeTask(before, NOW)
    if (!phone.success) throw new Error(phone.error.message)
    const found = server.objects.get(HREF)!
    server.objects.set(HREF, { ...found, etag: server.nextEtag(), ics: phone.output.ics })

    const result = await setTaskDone(before, true, NOW)

    expect(result.kind).toBe(WriteKind.Saved)
    expect(puts(server)).toBe(1)
    expect(tasks.value[0].status).toBe(TaskStatus.Completed)
  })
})

Deno.test(`a task cached without an etag is rebased on the fresh copy, so a same-field change is a conflict`, async () => {
  await withApp(async (server) => {
    const cached = await start(server)
    editElsewhere(server, `SUMMARY:Buy milk`, `SUMMARY:Buy cheese`)

    const result = await saveTask({ ...cached, etag: `` }, { title: `Buy oat milk` }, NOW)

    if (result.kind !== WriteKind.Conflict) throw new Error(`expected conflict, got ${result.kind}`)
    expect(result.conflict.fields).toEqual([EditField.Title])
    expect(puts(server)).toBe(0)
  })
})

Deno.test(`a task cached without an etag saves an edit of other fields on the fresh copy`, async () => {
  await withApp(async (server) => {
    const cached = await start(server)
    editElsewhere(server, `DESCRIPTION:Two litres`, `DESCRIPTION:Three litres`)

    const result = await saveTask({ ...cached, etag: `` }, { title: `Buy oat milk` }, NOW)

    expect(result.kind).toBe(WriteKind.Saved)
    const onServer = server.objects.get(HREF)!.ics
    expect(onServer).toContain(`SUMMARY:Buy oat milk`)
    expect(onServer).toContain(`DESCRIPTION:Three litres`)
  })
})
