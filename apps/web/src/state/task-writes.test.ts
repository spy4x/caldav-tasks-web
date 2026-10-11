/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { isUuid } from "@spy4x/platform/universal/uuid"
import { IcalDateKind } from "@spy4x/time/ical"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { getStorage } from "./db.ts"
import { refresh } from "./sync.ts"
import { saveTask, setTaskDone, tasks, undoWrite, WriteKind } from "./tasks.ts"
import { addTask, deleteTask, restoreTask } from "./task-writes.ts"
import { setBrowserOnline, withApp } from "./testing.ts"
import type { FakeServer } from "./testing.ts"

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-09T10:00:00.000Z`)

async function start(server: FakeServer) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`, [`X-VENDOR:keep me`]))
  await refresh()
  server.sent.length = 0
  return tasks.value[0]
}

Deno.test(`adding a task creates it in the list and shows it in the cache`, async () => {
  await withApp(async (server) => {
    await start(server)
    const result = await addTask(
      { title: `Pay rent`, due: { kind: IcalDateKind.Date, date: `2026-10-09` } },
      { listHref: LIST_HREF },
      NOW,
      `new-uid`,
    )
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    const onServer = server.objects.get(`${LIST_HREF}new-uid.ics`)!
    expect(onServer.ics).toContain(`SUMMARY:Pay rent`)
    expect(onServer.ics).toContain(`DUE;VALUE=DATE:20261009`)
    expect(tasks.value.map((t) => t.title).sort()).toEqual([`Buy milk`, `Pay rent`])
    expect((await getStorage().listTasks()).length).toBe(2)
  })
})

Deno.test(`adding a task while offline queues it under its own file name and shows it`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    const result = await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `u`)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.queued).toBe(true)
    expect(result.task.href).toBe(`${LIST_HREF}u.ics`)
    expect(server.sent).toEqual([])
    expect(tasks.value.map((t) => t.title).sort()).toEqual([`Buy milk`, `Pay rent`])
  })
})

Deno.test(`a task added without a UID gets a UUID version 7 and is stored under it`, async () => {
  await withApp(async (server) => {
    await start(server)
    const result = await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(isUuid(result.task.uid, 7)).toBe(true)
    const onServer = server.objects.get(`${LIST_HREF}${result.task.uid}.ics`)!
    expect(onServer.ics).toContain(`UID:${result.task.uid}`)
  })
})

Deno.test(`a task added offline without a UID gets a UUID version 7 and is queued under it`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    const result = await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.queued).toBe(true)
    expect(isUuid(result.task.uid, 7)).toBe(true)
    expect(result.task.href).toBe(`${LIST_HREF}${result.task.uid}.ics`)
    expect(result.task.ics).toContain(`UID:${result.task.uid}`)
  })
})

Deno.test(`a task made earlier with a UUID version 4 as its UID is still edited and completed`, async () => {
  await withApp(async (server) => {
    const uid = `3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b`
    const href = `${LIST_HREF}${uid}.ics`
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(href, LIST_HREF, fixture(uid, `Buy milk`))
    await refresh()
    expect(isUuid(tasks.value[0].uid, 4)).toBe(true)

    const edited = await saveTask(tasks.value[0], { title: `Buy oat milk` }, NOW)
    if (edited.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${edited.kind}`)
    const done = await setTaskDone(edited.task, true, NOW)
    if (done.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${done.kind}`)

    const onServer = server.objects.get(href)!.ics
    expect(onServer).toContain(`UID:${uid}`)
    expect(onServer).toContain(`SUMMARY:Buy oat milk`)
    expect(onServer).toContain(`STATUS:COMPLETED`)
    expect(tasks.value.map((t) => t.uid)).toEqual([uid])
  })
})

Deno.test(`a subtask is created in its parent's list and points at the parent`, async () => {
  await withApp(async (server) => {
    const parent = await start(server)
    const result = await addTask({ title: `Oat milk` }, { listHref: `/other/`, parent }, NOW, `kid`)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved`)
    expect(result.task.parentUid).toBe(parent.uid)
    expect(server.objects.has(`${LIST_HREF}kid.ics`)).toBe(true)
  })
})

Deno.test(`deleting sends the etag it was read with and drops the task from the cache`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    const result = await deleteTask(task)
    expect(result.kind).toBe(WriteKind.Saved)
    expect(server.objects.has(HREF)).toBe(false)
    expect(tasks.value).toEqual([])
    expect(await getStorage().listTasks()).toEqual([])
  })
})

Deno.test(`a delete of a task changed elsewhere is refused and the task stays`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    const found = server.objects.get(HREF)!
    server.objects.set(HREF, { ...found, etag: server.nextEtag() })
    const result = await deleteTask(task)
    expect(result).toEqual({
      kind: WriteKind.Failed,
      message: `The task changed on the server. Reload it and try again.`,
    })
    expect(server.objects.has(HREF)).toBe(true)
    expect(tasks.value.length).toBe(1)
  })
})

Deno.test(`restoring a deleted task creates the same text again`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    await deleteTask(task)
    const result = await restoreTask(task)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(server.objects.get(`${LIST_HREF}${task.uid}.ics`)!.ics).toBe(task.ics)
    expect(tasks.value.map((t) => t.title)).toEqual([`Buy milk`])
  })
})

Deno.test(`undoing a completion writes the text from before and keeps the vendor line`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const done = await setTaskDone(before, true, NOW)
    if (done.kind !== WriteKind.Saved) throw new Error(`expected saved`)
    expect(server.objects.get(HREF)!.ics).toContain(`STATUS:COMPLETED`)

    const undone = await undoWrite(done.task, before.ics)
    expect(undone.kind).toBe(WriteKind.Saved)
    expect(server.objects.get(HREF)!.ics).toBe(before.ics)
    expect(puts(server)).toBe(2)
  })
})

Deno.test(`an undo is refused when the task changed elsewhere since`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const done = await setTaskDone(before, true, NOW)
    if (done.kind !== WriteKind.Saved) throw new Error(`expected saved`)
    const found = server.objects.get(HREF)!
    const theirs = found.ics.replace(`X-VENDOR:keep me`, `X-VENDOR:changed`)
    server.objects.set(HREF, { ...found, etag: server.nextEtag(), ics: theirs })

    const undone = await undoWrite(done.task, before.ics)
    expect(undone.kind).toBe(WriteKind.Failed)
    expect(server.objects.get(HREF)!.ics).toBe(theirs)
  })
})

const puts = (server: FakeServer) => server.count(`PUT`, CALDAV_PATHS.object)
