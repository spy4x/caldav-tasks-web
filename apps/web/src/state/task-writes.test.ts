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
import { getOutbox } from "./outbox.ts"
import { pendingEntries } from "./pending.ts"
import { addTask, deleteTask, deleteTaskTree, restoreTask, subtasksOf } from "./task-writes.ts"
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

const href = (uid: string): string => `${LIST_HREF}${uid}.ics`

/**
 * A parent, two subtasks and a subtask of the first subtask, as the server holds them. `Done` is
 * completed, so the server lists it only when asked for completed tasks.
 */
async function startTree(server: FakeServer) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(href(`p`), LIST_HREF, fixture(`p`, `Parent`))
  server.seed(href(`a`), LIST_HREF, fixture(`a`, `Alpha`, [`RELATED-TO:p`]))
  server.seed(href(`b`), LIST_HREF, fixture(`b`, `Bravo`, [`RELATED-TO:p`]))
  server.seed(href(`a1`), LIST_HREF, fixture(`a1`, `Alpha one`, [`RELATED-TO:a`]))
  server.seed(href(`other`), LIST_HREF, fixture(`other`, `Unrelated`))
  await refresh()
  server.sent.length = 0
  return tasks.value.find((task) => task.uid === `p`)!
}

const titles = (): string[] => tasks.value.map((task) => task.title).sort()
const deletesSent = (server: FakeServer): number => server.count(`DELETE`, CALDAV_PATHS.object)

Deno.test(`the subtasks of a task are found however deep, each before its own parent`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    expect(subtasksOf(parent, tasks.value).map((task) => task.uid)).toEqual([`a1`, `a`, `b`])
    const alpha = tasks.value.find((task) => task.uid === `a`)!
    expect(subtasksOf(alpha, tasks.value).map((task) => task.uid)).toEqual([`a1`])
  })
})

Deno.test(`two tasks that name each other as parent are each found once`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(href(`x`), LIST_HREF, fixture(`x`, `X`, [`RELATED-TO:y`]))
    server.seed(href(`y`), LIST_HREF, fixture(`y`, `Y`, [`RELATED-TO:x`]))
    await refresh()
    const x = tasks.value.find((task) => task.uid === `x`)!
    expect(subtasksOf(x, tasks.value).map((task) => task.uid)).toEqual([`y`])
  })
})

const SECOND_HREF = `/dav/tasks/second/`

/** The tree of {@link startTree} plus a second list whose tasks name UIDs of the first. */
async function startTwoLists(server: FakeServer, second: [uid: string, rest: string[]][]) {
  server.seed(href(`p`), LIST_HREF, fixture(`p`, `Parent`))
  server.seed(href(`a`), LIST_HREF, fixture(`a`, `Alpha`, [`RELATED-TO:p`]))
  for (const [uid, rest] of second) {
    server.seed(`${SECOND_HREF}${uid}.ics`, SECOND_HREF, fixture(uid, `Second ${uid}`, rest))
  }
  server.calendarList = [
    { href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` },
    { href: SECOND_HREF, displayName: `Second`, changeMarker: `c1` },
  ]
  await refresh()
  return tasks.value.find((task) => task.uid === `p` && task.listHref === LIST_HREF)!
}

Deno.test(`a task in another list that names this task as its parent is not counted and stays on the server`, async () => {
  await withApp(async (server) => {
    const parent = await startTwoLists(server, [[`far`, [`RELATED-TO:p`]], [`far1`, [
      `RELATED-TO:a`,
    ]]])
    expect(tasks.value.length).toBe(4)
    expect(subtasksOf(parent, tasks.value).map((task) => task.uid)).toEqual([`a`])

    const { result } = await deleteTaskTree(parent)

    expect(result.kind).toBe(WriteKind.Saved)
    expect([...server.objects.keys()].sort()).toEqual([
      `${SECOND_HREF}far.ics`,
      `${SECOND_HREF}far1.ics`,
    ])
  })
})

Deno.test(`deleting one of two tasks with the same UID in two lists leaves the other and its subtask`, async () => {
  await withApp(async (server) => {
    const parent = await startTwoLists(server, [[`p`, []], [`kid`, [`RELATED-TO:p`]]])
    expect(tasks.value.length).toBe(4)
    expect(subtasksOf(parent, tasks.value).map((task) => task.uid)).toEqual([`a`])

    const { result } = await deleteTaskTree(parent)

    expect(result.kind).toBe(WriteKind.Saved)
    expect([...server.objects.keys()].sort()).toEqual([
      `${SECOND_HREF}kid.ics`,
      `${SECOND_HREF}p.ics`,
    ])
    const copy = tasks.value.find((task) => task.uid === `p`)!
    expect(subtasksOf(copy, tasks.value).map((task) => task.uid)).toEqual([`kid`])
  })
})

Deno.test(`deleting a task deletes its subtasks and theirs on the server and leaves the rest`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    const { result, deleted } = await deleteTaskTree(parent)
    expect(result.kind).toBe(WriteKind.Saved)
    expect([...server.objects.keys()]).toEqual([href(`other`)])
    expect(titles()).toEqual([`Unrelated`])
    expect((await getStorage().listTasks()).map((task) => task.href)).toEqual([href(`other`)])
    expect(deleted.map((task) => task.uid)).toEqual([`p`, `b`, `a`, `a1`])
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`the deletes of a task and its subtasks are sent subtasks first, deepest first`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    const order: string[] = []
    const handle = server.handle.bind(server)
    server.handle = (request) => {
      if (request.method !== `DELETE`) return handle(request)
      return request.clone().json().then((body: { href: string }) => {
        order.push(body.href)
        return handle(request)
      })
    }
    await deleteTaskTree(parent)
    expect(order).toEqual([href(`a1`), href(`a`), href(`b`), href(`p`)])
  })
})

Deno.test(`every delete of a task with subtasks is in the queue before the first is sent`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    let queuedAtFirstSend: string[] | undefined
    const handle = server.handle.bind(server)
    server.handle = (request) => {
      if (request.method === `DELETE`) {
        queuedAtFirstSend ??= pendingEntries.value
          .filter((entry) => entry.kind === `delete`)
          .map((entry) => entry.payload.href)
      }
      return handle(request)
    }
    await deleteTaskTree(parent)
    expect(queuedAtFirstSend).toEqual([href(`a1`), href(`a`), href(`b`), href(`p`)])
  })
})

Deno.test(`deleting a task with subtasks offline hides them all and sends every delete later`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    setBrowserOnline(false)
    const { result } = await deleteTaskTree(parent)
    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.queued).toBe(true)
    expect(titles()).toEqual([`Unrelated`])
    expect(deletesSent(server)).toBe(0)
    expect(server.objects.size).toBe(5)

    setBrowserOnline(true)
    await getOutbox().flush()

    expect([...server.objects.keys()]).toEqual([href(`other`)])
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a connection that drops between the deletes leaves the parent with the subtasks not yet deleted, and the rest go later`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    const handle = server.handle.bind(server)
    let sent = 0
    server.handle = (request) => {
      if (request.method === `DELETE` && ++sent === 2) server.down = true
      return handle(request)
    }
    const { result } = await deleteTaskTree(parent)
    expect(result.kind).toBe(WriteKind.Saved)
    // The server holds a whole tree: the parent and the subtasks whose delete did not arrive.
    expect([...server.objects.keys()].sort()).toEqual([
      href(`a`),
      href(`b`),
      href(`other`),
      href(`p`),
    ])
    expect(titles()).toEqual([`Unrelated`])

    server.handle = handle
    server.down = false
    await getOutbox().flush()

    expect([...server.objects.keys()]).toEqual([href(`other`)])
  })
})

Deno.test(`a completed subtask in the cache is deleted with its parent`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(href(`p`), LIST_HREF, fixture(`p`, `Parent`))
    server.seed(
      href(`d`),
      LIST_HREF,
      fixture(`d`, `Done`, [`RELATED-TO:p`, `STATUS:COMPLETED`, `COMPLETED:20261001T100000Z`]),
    )
    await refresh()
    const parent = tasks.value.find((task) => task.uid === `p`)!
    await deleteTaskTree(parent)
    expect(server.objects.size).toBe(0)
  })
})

Deno.test(`a subtask created offline and never sent is dropped with its parent`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    setBrowserOnline(false)
    await addTask({ title: `New` }, { listHref: LIST_HREF, parent }, NOW, `new`)
    expect(titles()).toContain(`New`)
    await deleteTaskTree(parent)
    expect(titles()).toEqual([`Unrelated`])

    setBrowserOnline(true)
    await getOutbox().flush()

    expect([...server.objects.keys()]).toEqual([href(`other`)])
    expect(server.count(`POST`, CALDAV_PATHS.objects)).toBe(0)
  })
})

Deno.test(`a subtask changed elsewhere is kept, the others are deleted and the result says so`, async () => {
  await withApp(async (server) => {
    const parent = await startTree(server)
    const bravo = server.objects.get(href(`b`))!
    server.objects.set(href(`b`), { ...bravo, etag: server.nextEtag() })
    const { result, deleted } = await deleteTaskTree(parent)
    expect(result).toEqual({
      kind: WriteKind.Failed,
      message: `1 of 4 tasks were not deleted. Message for conflict`,
    })
    expect([...server.objects.keys()].sort()).toEqual([href(`b`), href(`other`)])
    expect(deleted.map((task) => task.uid)).toEqual([`p`, `a`, `a1`])
    expect(titles()).toEqual([`Bravo`, `Unrelated`])
  })
})

Deno.test(`a task without subtasks is deleted directly, with nothing queued`, async () => {
  await withApp(async (server) => {
    await startTree(server)
    const other = tasks.value.find((task) => task.uid === `other`)!
    let queued = 0
    const stop = getOutbox().subscribe((entries) => queued += entries.length)
    const { result, deleted } = await deleteTaskTree(other)
    stop()
    expect(result.kind).toBe(WriteKind.Saved)
    expect(deleted).toEqual([other])
    expect(queued).toBe(0)
    expect(server.objects.has(href(`other`))).toBe(false)
    expect(server.objects.size).toBe(4)
  })
})
