/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { CALDAV_PATHS } from "@api/caldav.ts"
import { TaskStatus } from "@spy4x/time/ical-tasks-model"
import { getOutbox } from "../state/outbox.ts"
import { refresh } from "../state/sync.ts"
import { tasks } from "../state/tasks.ts"
import { setBrowserOnline, withApp } from "../state/testing.ts"
import type { FakeServer } from "../state/testing.ts"
import { toasts } from "../state/toasts.ts"
import { completeWithUndo, deleteWithUndo } from "./task-actions.ts"

const HREF = `${LIST_HREF}one.ics`

async function start(server: FakeServer) {
  toasts.clear()
  server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
  server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`, [`X-VENDOR:keep me`]))
  await refresh()
  return tasks.value[0]
}

function lastToast() {
  const toast = toasts.list.value.at(-1)
  if (!toast) throw new Error(`no toast was shown`)
  return toast
}

Deno.test(`completing a task shows a toast whose Undo puts the task back on the server`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    await completeWithUndo(task, true)
    expect(server.objects.get(HREF)!.ics).toContain(`STATUS:COMPLETED`)
    const toast = lastToast()
    expect(toast.body).toBe(`Completed "Buy milk"`)
    expect(toast.action?.label).toBe(`Undo`)

    await toast.action!.onAction()

    expect(server.objects.get(HREF)!.ics).toBe(task.ics)
    expect(lastToast().body).toBe(`Undone`)
    expect(tasks.value[0].status).toBe(task.status)
  })
})

Deno.test(`undoing a completion after someone changed the task elsewhere says so and keeps their change`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    await completeWithUndo(task, true)
    const toast = lastToast()
    const theirs = server.objects.get(HREF)!.ics.replace(`SUMMARY:Buy milk`, `SUMMARY:Their title`)
    server.seed(HREF, LIST_HREF, theirs)

    await toast.action!.onAction()

    expect(server.objects.get(HREF)!.ics).toBe(theirs)
    expect(lastToast().body).toContain(`changed`)
  })
})

Deno.test(`completing a task while offline queues it, and Undo takes it back before anything is sent`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    setBrowserOnline(false)
    await completeWithUndo(task, true)
    expect(tasks.value[0].status).toBe(TaskStatus.Completed)
    const toast = lastToast()
    expect(toast.body).toBe(`Completed "Buy milk"`)

    await toast.action!.onAction()

    expect(lastToast().body).toBe(`Undone`)
    expect(tasks.value[0].status).toBe(task.status)
    setBrowserOnline(true)
    await getOutbox().flush()
    expect(server.count(`PUT`, CALDAV_PATHS.object)).toBe(0)
    expect(server.objects.get(HREF)!.ics).toBe(task.ics)
  })
})

Deno.test(`deleting a task while offline hides it, and Undo brings it back without the server hearing of it`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    setBrowserOnline(false)
    expect(await deleteWithUndo(task)).toBe(true)
    expect(tasks.value).toEqual([])

    await lastToast().action!.onAction()

    expect(lastToast().body).toBe(`Restored`)
    expect(tasks.value.map((t) => t.title)).toEqual([`Buy milk`])
    setBrowserOnline(true)
    await getOutbox().flush()
    expect(server.count(`DELETE`, CALDAV_PATHS.object)).toBe(0)
    expect(server.count(`POST`, CALDAV_PATHS.objects)).toBe(0)
    expect(server.objects.has(HREF)).toBe(true)
  })
})

Deno.test(`deleting a task shows a toast whose Undo creates it again with its unknown properties`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    expect(await deleteWithUndo(task)).toBe(true)
    expect(server.objects.has(HREF)).toBe(false)
    expect(tasks.value).toEqual([])
    const toast = lastToast()
    expect(toast.body).toBe(`Deleted "Buy milk"`)

    await toast.action!.onAction()

    const restored = [...server.objects.values()].map((o) => o.ics)
    expect(restored.length).toBe(1)
    expect(restored[0]).toContain(`SUMMARY:Buy milk`)
    expect(restored[0]).toContain(`X-VENDOR:keep me`)
    expect(tasks.value.map((t) => t.title)).toEqual([`Buy milk`])
  })
})

Deno.test(`a delete the server refuses shows the reason and no Undo`, async () => {
  await withApp(async (server) => {
    const task = await start(server)
    server.seed(HREF, LIST_HREF, task.ics.replace(`SUMMARY:Buy milk`, `SUMMARY:Elsewhere`))
    expect(await deleteWithUndo(task)).toBe(false)
    expect(lastToast().action).toBeUndefined()
    expect(server.objects.has(HREF)).toBe(true)
  })
})
