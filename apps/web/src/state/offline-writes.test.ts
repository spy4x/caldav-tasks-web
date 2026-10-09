/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { conflicts, keepMineOf, useTheirsOf } from "./conflicts.ts"
import { getStorage } from "./db.ts"
import { createTestOutboxStore, getOutbox, loadOutbox, useOutboxStore } from "./outbox.ts"
import { pendingEntries } from "./pending.ts"
import { refresh } from "./sync.ts"
import { saveTask, setTaskDone, tasks, WriteKind } from "./tasks.ts"
import { addTask, deleteTask } from "./task-writes.ts"
import { error, type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

const HREF = `${LIST_HREF}one.ics`
const NOW = new Date(`2026-10-09T10:00:00.000Z`)

async function start(server: FakeServer) {
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`, [`X-VENDOR:keep me`]))
  await refresh()
  server.sent.length = 0
  return tasks.value[0]
}

/** The network comes back and the sync runner sends the queue. */
async function reconnect(): Promise<void> {
  setBrowserOnline(true)
  await getOutbox().flush()
}

/** Another client edits the task on the server, as Tasks.org on the phone would. */
function editElsewhere(server: FakeServer, to: string) {
  const found = server.objects.get(HREF)!
  server.objects.set(HREF, {
    ...found,
    etag: server.nextEtag(),
    ics: found.ics.replace(`SUMMARY:Buy milk`, `SUMMARY:${to}`),
  })
}

const titles = () => tasks.value.map((t) => t.title).sort()

Deno.test(`an edit made offline is sent on reconnect with the etag it was made on`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    expect(server.sent).toEqual([])
    expect(pendingEntries.value.length).toBe(1)

    await reconnect()

    const onServer = server.objects.get(HREF)!
    expect(onServer.ics).toContain(`SUMMARY:Oat milk`)
    expect(onServer.ics).toContain(`X-VENDOR:keep me`)
    expect(pendingEntries.value).toEqual([])
    expect(tasks.value[0].etag).toBe(onServer.etag)
    expect((await getStorage().listTasks())[0].etag).toBe(onServer.etag)
  })
})

Deno.test(`two offline edits of one task are sent as one write`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    await saveTask(tasks.value[0], { title: `Oat milk 2l` }, NOW)
    expect(pendingEntries.value.length).toBe(1)

    await reconnect()

    expect(server.count(`PUT`, CALDAV_PATHS.object)).toBe(1)
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Oat milk 2l`)
  })
})

Deno.test(`completing a task offline is sent on reconnect`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await setTaskDone(before, true, NOW)
    expect(server.objects.get(HREF)!.ics).not.toContain(`STATUS:COMPLETED`)

    await reconnect()

    expect(server.objects.get(HREF)!.ics).toContain(`STATUS:COMPLETED`)
  })
})

Deno.test(`a delete made offline hides the task at once and is sent on reconnect`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    const result = await deleteTask(before)
    expect(result.kind).toBe(WriteKind.Saved)
    expect(tasks.value).toEqual([])
    expect(server.objects.has(HREF)).toBe(true)

    await reconnect()

    expect(server.objects.has(HREF)).toBe(false)
    expect(await getStorage().listTasks()).toEqual([])
    expect(tasks.value).toEqual([])
  })
})

Deno.test(`a task created offline is sent on reconnect and becomes the server's task`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
    expect(titles()).toEqual([`Buy milk`, `Pay rent`])

    await reconnect()

    expect(server.objects.get(`${LIST_HREF}rent.ics`)!.ics).toContain(`SUMMARY:Pay rent`)
    expect(pendingEntries.value).toEqual([])
    expect(titles()).toEqual([`Buy milk`, `Pay rent`])
    const created = tasks.value.find((t) => t.uid === `rent`)!
    expect(created.etag).toBe(server.objects.get(created.href)!.etag)
  })
})

Deno.test(`a create whose answer was lost is not made twice when it is sent again`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
    setBrowserOnline(true)
    server.loseNextAnswer = true

    await getOutbox().flush()
    expect(server.objects.has(`${LIST_HREF}rent.ics`)).toBe(true)
    expect(pendingEntries.value.length).toBe(1)

    await getOutbox().flush()

    expect([...server.objects.keys()].sort()).toEqual([HREF, `${LIST_HREF}rent.ics`])
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a task created and deleted offline is never sent`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    const created = await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
    if (created.kind !== WriteKind.Saved) throw new Error(`expected saved`)
    await deleteTask(created.task)
    expect(titles()).toEqual([`Buy milk`])

    await reconnect()

    expect(server.count(`POST`, CALDAV_PATHS.objects)).toBe(0)
  })
})

Deno.test(`an edit made after the network is back joins the waiting write and both go out as one`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    setBrowserOnline(true)

    await saveTask(tasks.value[0], { notes: `two litres` }, NOW)

    // Sent ahead of the waiting write it would meet the old etag: one write, no 412.
    expect(server.count(`PUT`, CALDAV_PATHS.object)).toBe(1)
    expect(pendingEntries.value).toEqual([])
    const ics = server.objects.get(HREF)!.ics
    expect(ics).toContain(`SUMMARY:Oat milk`)
    expect(ics).toContain(`two litres`)
  })
})

Deno.test(`a task changed elsewhere while offline waits for a choice, and keeping mine writes over it`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Their milk`)

    await reconnect()

    expect(conflicts.value.map((c) => [c.label, c.reason])).toEqual([[`Oat milk`, `version`]])
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Their milk`)
    expect(tasks.value[0].title).toBe(`Oat milk`)

    await keepMineOf(conflicts.value[0].id)

    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Oat milk`)
    expect(conflicts.value).toEqual([])
    expect(pendingEntries.value).toEqual([])
    expect(tasks.value[0].etag).toBe(server.objects.get(HREF)!.etag)
  })
})

Deno.test(`an offline edit is not written over a change the app learned of before it was sent`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Their milk`)
    // The app refreshes while the edit waits, so its cache already holds their newer copy.
    await refresh()

    await reconnect()

    expect(conflicts.value.map((c) => c.reason)).toEqual([`version`])
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Their milk`)
  })
})

Deno.test(`a delete made while an edit still waits replaces it and is sent once`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    // The network is back but the server is not answering yet, so the edit still waits.
    setBrowserOnline(true)
    server.down = true

    await deleteTask(tasks.value[0])
    server.down = false
    server.sent.length = 0
    await getOutbox().flush()

    expect(server.objects.has(HREF)).toBe(false)
    expect(server.count(`PUT`, CALDAV_PATHS.object)).toBe(0)
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a delete of a task whose edit waits for a choice joins the queue instead of going to the server`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Their milk`)
    await reconnect()
    expect(conflicts.value.length).toBe(1)

    const result = await deleteTask(tasks.value[0])

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.queued).toBe(true)
    expect(server.objects.has(HREF)).toBe(true)
  })
})

Deno.test(`using theirs drops the offline edit and shows the server's task`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Their milk`)
    await reconnect()

    await useTheirsOf(conflicts.value[0].id)

    expect(tasks.value[0].title).toBe(`Their milk`)
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Their milk`)
    expect(pendingEntries.value).toEqual([])
    expect((await getStorage().listTasks())[0].ics).toContain(`SUMMARY:Their milk`)
  })
})

Deno.test(`a task deleted elsewhere is reported gone and can only be discarded`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    server.objects.delete(HREF)

    await reconnect()

    expect(conflicts.value.map((c) => c.reason)).toEqual([`gone`])
    // Keep mine does not apply to a task that is gone: nothing changes.
    await keepMineOf(conflicts.value[0].id)
    expect(conflicts.value.length).toBe(1)
    expect(server.count(`POST`, CALDAV_PATHS.objects)).toBe(0)

    await useTheirsOf(conflicts.value[0].id)

    expect(conflicts.value).toEqual([])
    expect(tasks.value).toEqual([])
    expect(await getStorage().listTasks()).toEqual([])
  })
})

Deno.test(`a delete of a task changed elsewhere waits for a choice instead of removing their edit`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await deleteTask(before)
    editElsewhere(server, `Their milk`)

    await reconnect()

    expect(conflicts.value.map((c) => c.reason)).toEqual([`version`])
    expect(server.objects.has(HREF)).toBe(true)
    await useTheirsOf(conflicts.value[0].id)
    expect(tasks.value[0].title).toBe(`Their milk`)
  })
})

Deno.test(`a refused CalDAV account keeps the write queued and nothing is lost`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    setBrowserOnline(true)
    server.next = error(502, `caldav_refused`)

    await getOutbox().flush()

    expect(pendingEntries.value.map((e) => e.status)).toEqual([`pending`])
    expect(conflicts.value).toEqual([])
    await getOutbox().flush()
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Oat milk`)
  })
})

Deno.test(`a CalDAV server error keeps the write queued, a refusal for good becomes a conflict`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    setBrowserOnline(true)

    server.next = error(502, `caldav_failed`)
    await getOutbox().flush()
    expect(pendingEntries.value.map((e) => e.status)).toEqual([`pending`])

    server.next = error(400, `bad_request`)
    await getOutbox().flush()
    expect(conflicts.value.map((c) => c.reason)).toEqual([`rejected`])
  })
})

Deno.test(`writes made before a restart are still queued, shown, and sent afterwards`, async () => {
  await withApp(async (server) => {
    const store = createTestOutboxStore()
    useOutboxStore(store)
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)

    // The page is closed and opened again: a new outbox on the same storage.
    useOutboxStore(store)
    expect(pendingEntries.value).toEqual([])
    await loadOutbox()
    expect(pendingEntries.value.length).toBe(2)
    expect(titles()).toEqual([`Oat milk`, `Pay rent`])

    await reconnect()

    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Oat milk`)
    expect(server.objects.has(`${LIST_HREF}rent.ics`)).toBe(true)
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a refresh while a write waits keeps showing the written copy`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    setBrowserOnline(true)
    editElsewhere(server, `Their milk`)
    server.calendarList = [{ ...server.calendarList[0], changeMarker: `c2` }]

    await refresh()

    expect((await getStorage().listTasks())[0].ics).toContain(`SUMMARY:Their milk`)
    expect(tasks.value[0].title).toBe(`Oat milk`)
  })
})

Deno.test(`an edit made while the offline create is being sent is sent after it, on the created task`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
    setBrowserOnline(true)
    let edit: Promise<unknown> | undefined
    const original = server.handle.bind(server)
    server.handle = (request: Request) => {
      if (request.method === `POST` && !edit) {
        edit = saveTask(
          tasks.value.find((t) => t.uid === `rent`)!,
          { title: `Pay rent today` },
          NOW,
        )
      }
      return original(request)
    }

    await getOutbox().flush()
    await edit
    await getOutbox().flush()

    expect(server.objects.get(`${LIST_HREF}rent.ics`)!.ics).toContain(`SUMMARY:Pay rent today`)
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a delete made while the offline create is being sent removes the created task`, async () => {
  await withApp(async (server) => {
    await start(server)
    setBrowserOnline(false)
    await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
    setBrowserOnline(true)
    let removal: Promise<unknown> | undefined
    const original = server.handle.bind(server)
    server.handle = (request: Request) => {
      if (request.method === `POST` && !removal) {
        removal = deleteTask(tasks.value.find((t) => t.uid === `rent`)!)
      }
      return original(request)
    }

    await getOutbox().flush()
    await removal
    await getOutbox().flush()

    expect(server.objects.has(`${LIST_HREF}rent.ics`)).toBe(false)
    expect(pendingEntries.value).toEqual([])
  })
})

Deno.test(`a tick made while the offline edit is being sent keeps the offline edit`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Phone title`)
    setBrowserOnline(true)
    let tick: Promise<unknown> | undefined
    const original = server.handle.bind(server)
    server.handle = (request: Request) => {
      if (request.method === `PUT` && !tick) {
        tick = setTaskDone(tasks.value.find((t) => t.href === HREF)!, true, NOW)
      }
      return original(request)
    }

    await getOutbox().flush()
    await tick
    await getOutbox().flush()

    const waiting = pendingEntries.value.map((entry) => entry.payload.ics)
    expect([server.objects.get(HREF)!.ics, ...waiting].join()).toContain(`SUMMARY:Oat milk`)
  })
})

Deno.test({
  name: `an offline edit survives a second edit made right after reconnect`,
  fn: async () => {
    await withApp(async (server) => {
      const before = await start(server)
      setBrowserOnline(false)
      await saveTask(before, { title: `Oat milk` }, NOW)
      editElsewhere(server, `Phone title`)
      setBrowserOnline(true)

      const result = await setTaskDone(tasks.value[0], true, NOW)

      expect(titles()).toContain(`Oat milk`)
      // The refused write is not reported as waiting to be sent: it waits for a choice.
      if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
      expect(result.conflict).toBe(`version`)
      expect(result.queued).toBeFalsy()
      expect(conflicts.value.map((c) => c.reason)).toEqual([`version`])
    })
  },
})

Deno.test(`a delete refused behind an offline edit is reported as a conflict, not as waiting`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    setBrowserOnline(false)
    await saveTask(before, { title: `Oat milk` }, NOW)
    editElsewhere(server, `Phone title`)
    setBrowserOnline(true)

    const result = await deleteTask(tasks.value[0])

    if (result.kind !== WriteKind.Saved) throw new Error(`expected saved, got ${result.kind}`)
    expect(result.conflict).toBe(`version`)
    expect(result.queued).toBeFalsy()
    expect(server.objects.has(HREF)).toBe(true)
    expect(conflicts.value.map((c) => c.reason)).toEqual([`version`])
  })
})

/** Every href the app names to the relay, from the bodies and queries of the requests it sends. */
function hrefsSent(requests: { url: string; body: unknown }[]): string[] {
  const found: string[] = []
  for (const { url, body } of requests) {
    const query = new URL(url).searchParams
    for (const key of [`href`, `calendar`]) {
      const value = query.get(key) ?? (body as Record<string, unknown> | undefined)?.[key]
      if (typeof value === `string`) found.push(value)
    }
  }
  return found
}

Deno.test(`every write, conflict read and delete names its task and list by path only`, async () => {
  await withApp(async (server) => {
    const before = await start(server)
    const requests: { url: string; body: unknown }[] = []
    const answering = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const text = typeof init?.body === `string` ? init.body : ``
      requests.push({
        url: new URL(String(input), `http://localhost`).href,
        body: text ? JSON.parse(text) : undefined,
      })
      return answering(input, init)
    }
    try {
      setBrowserOnline(false)
      await addTask({ title: `Pay rent` }, { listHref: LIST_HREF }, NOW, `rent`)
      await reconnect()
      setBrowserOnline(false)
      await saveTask(before, { title: `Oat milk` }, NOW)
      editElsewhere(server, `Their milk`)
      await reconnect()
      await keepMineOf(conflicts.value[0].id)
      setBrowserOnline(false)
      await deleteTask(tasks.value.find((t) => t.uid === `rent`)!)
      await reconnect()
    } finally {
      globalThis.fetch = answering
    }

    const hrefs = hrefsSent(requests)
    // A create (calendar), an update (href), the conflict read (href) and a queued delete (href).
    expect(hrefs.length).toBeGreaterThanOrEqual(4)
    expect(hrefs.filter((href) => !/^\/(?!\/)[^:]*$/.test(href))).toEqual([])
    expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Oat milk`)
    expect(server.objects.has(`${LIST_HREF}rent.ics`)).toBe(false)
  })
})
