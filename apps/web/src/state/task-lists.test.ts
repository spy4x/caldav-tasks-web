/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { COMPLETED, LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { allTags, taskLists } from "./task-lists.ts"
import { refresh } from "./sync.ts"
import { tasks } from "./tasks.ts"
import { withApp } from "./testing.ts"

Deno.test(`a list counts the tasks that are not completed, and a list with none counts zero`, async () => {
  await withApp(async (server) => {
    server.calendarList = [
      { href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` },
      { href: `/dav/tasks/empty/`, displayName: `Empty`, changeMarker: `c2` },
    ]
    server.seed(`${LIST_HREF}a.ics`, LIST_HREF, fixture(`a`, `Open one`))
    server.seed(`${LIST_HREF}b.ics`, LIST_HREF, fixture(`b`, `Open two`))
    server.seed(`${LIST_HREF}c.ics`, LIST_HREF, COMPLETED)
    await refresh()
    expect(Object.fromEntries(taskLists.value.map((l) => [l.name, l.openCount]))).toEqual({
      Errands: 2,
      Empty: 0,
    })
    tasks.value = tasks.value.slice(1)
    expect(taskLists.value.find((l) => l.name === `Errands`)?.openCount).toBe(1)
  })
})

Deno.test(`tags in use are listed once, sorted`, async () => {
  await withApp(async (server) => {
    server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
    server.seed(`${LIST_HREF}a.ics`, LIST_HREF, fixture(`a`, `A`, [`CATEGORIES:Zed`]))
    server.seed(`${LIST_HREF}b.ics`, LIST_HREF, fixture(`b`, `B`, [`CATEGORIES:home,Zed`]))
    await refresh()
    expect(allTags.value).toEqual([`home`, `Zed`])
  })
})
