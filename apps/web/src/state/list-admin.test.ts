/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { LIST_ADMIN_OFFLINE } from "@ui/list-settings.tsx"
import { getStorage } from "./db.ts"
import { createList, deleteList, updateList } from "./list-admin.ts"
import { refresh } from "./sync.ts"
import { taskLists } from "./task-lists.ts"
import { tasks } from "./tasks.ts"
import { error, type FakeServer, setBrowserOnline, withApp } from "./testing.ts"

async function start(server: FakeServer) {
  server.calendarList = [
    { href: LIST_HREF, displayName: `Errands`, color: `#E07A5FFF`, changeMarker: `c1` },
  ]
  server.seed(`${LIST_HREF}one.ics`, LIST_HREF, fixture(`1`, `Buy milk`))
  await refresh()
  server.sent.length = 0
  return taskLists.value[0]
}

Deno.test(`creating a list sends its name and colour and shows it once the server has it`, async () => {
  await withApp(async (server) => {
    await start(server)
    const result = await createList({ name: `Shopping`, color: `#81b29a` })
    if (!result.ok) throw new Error(result.message)
    expect(server.count(`POST`, CALDAV_PATHS.calendars)).toBe(1)
    expect(taskLists.value.find((list) => list.href === result.value)).toMatchObject({
      name: `Shopping`,
      color: `#81B29AFF`,
    })
  })
})

Deno.test(`saving a list sends only the changed name or colour, and nothing when nothing changed`, async () => {
  await withApp(async (server) => {
    const list = await start(server)
    expect(await updateList(list, { name: `Errands`, color: `#e07a5f` })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(server.count(`PATCH`, CALDAV_PATHS.calendar)).toBe(0)

    const bodies: unknown[] = []
    const own = globalThis.fetch
    globalThis.fetch = (input, init) => {
      if (init?.method === `PATCH`) bodies.push(JSON.parse(String(init.body)))
      return own(input, init)
    }
    try {
      expect((await updateList(list, { name: `Chores`, color: `#e07a5f` })).ok).toBe(true)
      expect((await updateList(taskLists.value[0], { name: `Chores`, color: `#3d405b` })).ok)
        .toBe(true)
    } finally {
      globalThis.fetch = own
    }
    expect(bodies).toEqual([
      { href: LIST_HREF, displayName: `Chores` },
      { href: LIST_HREF, color: `#3d405b` },
    ])
    expect(taskLists.value[0]).toMatchObject({ name: `Chores`, color: `#3D405BFF` })
  })
})

Deno.test(`deleting a list removes it and its tasks from the cache`, async () => {
  await withApp(async (server) => {
    const list = await start(server)
    expect(tasks.value.length).toBe(1)
    const result = await deleteList(list)
    expect(result.ok).toBe(true)
    expect(server.count(`DELETE`, CALDAV_PATHS.calendar)).toBe(1)
    expect(taskLists.value).toEqual([])
    expect(tasks.value).toEqual([])
    expect(await getStorage().listTasks()).toEqual([])
  })
})

Deno.test(`offline, a list change is refused with the offline message and nothing is sent`, async () => {
  await withApp(async (server) => {
    const list = await start(server)
    setBrowserOnline(false)
    for (
      const result of [
        await createList({ name: `Shopping`, color: `#81b29a` }),
        await updateList(list, { name: `Chores`, color: `#81b29a` }),
        await deleteList(list),
      ]
    ) {
      expect(result).toEqual({ ok: false, message: LIST_ADMIN_OFFLINE })
    }
    expect(server.sent).toEqual([])
    expect(taskLists.value.map((l) => l.name)).toEqual([`Errands`])
  })
})

Deno.test(`a change that gets no answer says offline, and a refusal shows the server's message`, async () => {
  await withApp(async (server) => {
    const list = await start(server)
    server.down = true
    expect(await deleteList(list)).toEqual({ ok: false, message: LIST_ADMIN_OFFLINE })
    server.down = false
    // The app stays offline until a request is answered again, as the next sync does.
    await refresh()
    server.next = error(502, `caldav_refused`, `The CalDAV server forbids this`)
    expect(await deleteList(list)).toEqual({
      ok: false,
      message: `The CalDAV server forbids this`,
    })
    expect(taskLists.value.map((l) => l.name)).toEqual([`Errands`])
  })
})
