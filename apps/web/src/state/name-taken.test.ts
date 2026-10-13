/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { isUuid } from "@spy4x/platform/universal/uuid"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { conflicts } from "./conflicts.ts"
import {
  createTestOutboxStore,
  getOutbox,
  loadOutbox,
  movesDone,
  useOutboxStore,
} from "./outbox.ts"
import { pendingEntries, type TaskEntry } from "./pending.ts"
import { refresh } from "./sync.ts"
import { saveTask, tasks, undoWrite, WriteKind } from "./tasks.ts"
import { addTask, deleteTask } from "./task-writes.ts"
import { type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

// A task created on this device is stored as `<its UID>.ics`. Here the new task's UID is `one`, and
// `one.ics` already holds a different task (UID `1`), so the server refuses the create.

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-09T10:00:00.000Z`)

type Store = ReturnType<typeof createTestOutboxStore>

async function start(server: FakeServer) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`, [`X-VENDOR:keep me`]))
  await refresh()
  server.sent.length = 0
  return { ...server.objects.get(HREF)! }
}

/** Adds "Pay rent" offline under the taken file name; the network is then back, nothing sent. */
async function addOfflineUnderTakenName(): Promise<void> {
  setBrowserOnline(false)
  await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `one`)
  setBrowserOnline(true)
}

/** The objects on the server besides the task that held the name, as `[file id, text]`. */
function added(server: FakeServer): [string, string][] {
  return [...server.objects]
    .filter(([href]) => href !== HREF)
    .map(([href, object]) => [href.slice(LIST_HREF.length, -`.ics`.length), object.ics])
}

/** The store's first new copy of the refused create: a create under another id, not yet saved. */
const isNewCopy = (entry: TaskEntry): boolean =>
  entry.kind === `create` && entry.entityId !== `one` && entry.seq === undefined

/** Sends the queue, as the sync runner does, and waits for the move a refusal starts. */
async function flush(): Promise<void> {
  await getOutbox().flush()
  await movesDone()
}

const titles = () => tasks.value.map((t) => t.title).sort()

Deno.test(`a task created offline under a file name another task holds is saved under a new UUID version 7 name`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    await addOfflineUnderTakenName()

    await flush()

    expect(server.objects.get(HREF)).toEqual(other)
    expect(added(server).length).toBe(1)
    const [fileId, ics] = added(server)[0]
    expect(isUuid(fileId, 7)).toBe(true)
    expect(ics).toContain(`SUMMARY:Pay rent`)
    expect(ics).toContain(`UID:one`)
    expect(pendingEntries.value).toEqual([])
    expect(conflicts.value).toEqual([])
    expect(titles()).toEqual([`Buy milk`, `Pay rent`])
    expect(server.count(`PUT`, CALDAV_PATHS.object)).toBe(0)
    expect(server.count(`DELETE`, CALDAV_PATHS.object)).toBe(0)
  })
})

Deno.test(`a task moved to a new file name whose answer was lost is sent again under that same name`, async () => {
  await withApp(async (server) => {
    await start(server)
    await addOfflineUnderTakenName()
    // The first create is the refused one; the answer to the second, under the new name, is lost.
    const handle = server.handle.bind(server)
    let creates = 0
    server.handle = (request) => {
      if (request.method === `POST` && ++creates === 2) server.loseNextAnswer = true
      return handle(request)
    }

    await flush()
    const stored = added(server)
    expect(stored.length).toBe(1)
    expect(pendingEntries.value.map((entry) => entry.entityId)).toEqual([stored[0][0]])

    // The queue kept the new file id, so the repeat finds its own object and makes no second one.
    await flush()

    expect(added(server)).toEqual(stored)
    expect(pendingEntries.value).toEqual([])
    expect(conflicts.value).toEqual([])
  })
})

Deno.test(`a page closed after the new copy was queued and before the refused one was dropped sends the task once`, async () => {
  await withApp(async (server) => {
    await start(server)
    const inner = createTestOutboxStore()
    let closing = true
    const store: Store = {
      ...inner,
      // The page goes away at the step that would drop the refused create.
      removeEntry(seq) {
        if (!closing) return inner.removeEntry(seq)
        closing = false
        return Promise.reject(new Error(`the page closed`))
      },
    }
    useOutboxStore(store)
    await addOfflineUnderTakenName()
    await flush()
    expect(pendingEntries.value.map((entry) => entry.status)).toEqual([`conflict`, `pending`])

    // The page opens again on the same queue.
    useOutboxStore(store)
    await loadOutbox()
    await movesDone()
    await flush()

    expect(added(server).length).toBe(1)
    expect(added(server)[0][1]).toContain(`SUMMARY:Pay rent`)
    expect(pendingEntries.value).toEqual([])
    expect(conflicts.value).toEqual([])
  })
})

Deno.test(`an edit that reaches the refused create while it is being moved is the text that is saved, once`, async () => {
  await withApp(async (server) => {
    await start(server)
    const inner = createTestOutboxStore()
    let edited = false
    const store: Store = {
      ...inner,
      // Another tab's edit of the task lands just before the new copy is stored.
      async putEntry(entry) {
        if (!edited && isNewCopy(entry)) {
          edited = true
          const refused = (await inner.readOutbox()).find((other) => other.entityId === `one`)!
          const ics = refused.payload.ics.replace(`SUMMARY:Pay rent`, `SUMMARY:Pay rent today`)
          await inner.putEntry({ ...refused, key: `edit`, payload: { ...refused.payload, ics } })
        }
        return await inner.putEntry(entry)
      },
    }
    useOutboxStore(store)
    await addOfflineUnderTakenName()

    await flush()

    expect(edited).toBe(true)
    expect(added(server).length).toBe(1)
    expect(added(server)[0][1]).toContain(`SUMMARY:Pay rent today`)
    expect(pendingEntries.value).toEqual([])
    expect(conflicts.value).toEqual([])
  })
})

Deno.test(`a refused create that another tab is already moving is not moved a second time`, async () => {
  await withApp(async (server) => {
    await start(server)
    const inner = createTestOutboxStore()
    let rival = false
    const store: Store = {
      ...inner,
      // The other tab's copy is stored just before this tab's.
      async putEntry(entry) {
        if (!rival && isNewCopy(entry)) {
          rival = true
          const href = `${LIST_HREF}other-tab.ics`
          await inner.putEntry({
            ...entry,
            key: `rival`,
            entityId: `other-tab`,
            payload: { ...entry.payload, href },
          })
        }
        return await inner.putEntry(entry)
      },
    }
    useOutboxStore(store)
    await addOfflineUnderTakenName()

    await flush()

    expect(rival).toBe(true)
    expect(added(server).map(([fileId]) => fileId)).toEqual([`other-tab`])
    // The refused create is the other tab's to drop; this tab's own copy is gone.
    expect(pendingEntries.value.map((entry) => entry.entityId)).toEqual([`one`])
  })
})

Deno.test(`a task added on a dropped connection under a file name another task holds is saved under a new one at once`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    // The create is refused, but its answer is lost, so the task goes to the queue and is sent again.
    server.loseNextAnswer = true

    const result = await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `one`)

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(server.objects.get(HREF)).toEqual(other)
    expect(added(server).length).toBe(1)
    const [fileId, ics] = added(server)[0]
    expect(isUuid(fileId, 7)).toBe(true)
    expect(ics).toContain(`SUMMARY:Pay rent`)
    expect(result.task.href).toBe(`${LIST_HREF}${fileId}.ics`)
    expect(pendingEntries.value).toEqual([])
    expect(titles()).toEqual([`Buy milk`, `Pay rent`])
  })
})

Deno.test(`a refused create whose new copy another tab has already sent is dropped, and the task is on the server once`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    const inner = createTestOutboxStore()
    let sent = false
    const store: Store = {
      ...inner,
      // Another tab, which does not hold the copy back, sends it as soon as it is stored.
      async putEntry(entry) {
        const stored = await inner.putEntry(entry)
        if (!sent && isNewCopy(entry)) {
          sent = true
          const copy = (await inner.readOutbox()).find((one) => one.entityId === entry.entityId)!
          server.seed(copy.payload.href, LIST_HREF, copy.payload.ics)
          await inner.removeEntry(copy.seq!)
        }
        return stored
      },
    }
    useOutboxStore(store)
    await addOfflineUnderTakenName()

    await flush()

    expect(sent).toBe(true)
    expect(pendingEntries.value).toEqual([])
    expect(conflicts.value).toEqual([])
    expect(added(server).length).toBe(1)
    expect(server.objects.get(HREF)).toEqual(other)
  })
})

Deno.test(`deleting a new task while its create waits refused under a taken file name drops the create and leaves the task that holds the name`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    const inner = createTestOutboxStore()
    const store: Store = {
      ...inner,
      // The move to a new file name cannot start, so the refused create stays as a card.
      putEntry: (entry) =>
        isNewCopy(entry) ? Promise.reject(new Error(`no room`)) : inner.putEntry(entry),
    }
    useOutboxStore(store)
    await addOfflineUnderTakenName()
    await flush()
    expect(conflicts.value.length).toBe(1)
    const mine = tasks.value.find((task) => task.title === `Pay rent`)!

    const result = await deleteTask(mine)
    await flush()

    expect(result.kind).toBe(WriteKind.Saved)
    expect(server.count(`DELETE`, CALDAV_PATHS.object)).toBe(0)
    expect(server.objects.get(HREF)).toEqual(other)
    expect(added(server)).toEqual([])
    expect(pendingEntries.value).toEqual([])
    expect(titles()).toEqual([`Buy milk`])
  })
})

Deno.test(`deleting a task from a copy read before it moved to a new file name deletes that task and leaves the task that holds the name`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    await addOfflineUnderTakenName()
    // What an open screen still holds: the task at the taken address.
    const stale = tasks.value.find((task) => task.title === `Pay rent`)!
    expect(stale.href).toBe(HREF)
    await flush()
    expect(added(server).length).toBe(1)

    const result = await deleteTask(stale)

    expect(result.kind).toBe(WriteKind.Saved)
    expect(server.objects.get(HREF)).toEqual(other)
    expect(added(server)).toEqual([])
    expect(titles()).toEqual([`Buy milk`])
  })
})

Deno.test(`Undo of an edit made before the task moved to a new file name is written to the task, not to the one that holds the name`, async () => {
  await withApp(async (server) => {
    const other = await start(server)
    await addOfflineUnderTakenName()
    const before = tasks.value.find((task) => task.title === `Pay rent`)!
    const edited = await saveTask(before, { title: `Pay rent today` }, NOW)
    if (edited.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${edited.kind}`)
    await flush()
    expect(added(server)[0][1]).toContain(`SUMMARY:Pay rent today`)

    // The Undo toast still holds the copy at the taken address.
    const result = await undoWrite(edited.task, before.ics)

    expect(result.kind).toBe(WriteKind.Saved)
    expect(server.objects.get(HREF)).toEqual(other)
    expect(added(server).length).toBe(1)
    expect(added(server)[0][1]).toContain(`SUMMARY:Pay rent\r\n`)
    expect(titles()).toEqual([`Buy milk`, `Pay rent`])
  })
})
