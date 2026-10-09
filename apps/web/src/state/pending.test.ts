/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { parseTask, type Task } from "@spy4x/time/ical-tasks-model"
import { overlay, type TaskEntry, versionOf } from "./pending.ts"

function parsed(id: string, title: string, etag = `"e${id}"`): Task {
  const result = parseTask({
    href: `${LIST_HREF}${id}.ics`,
    etag,
    listHref: LIST_HREF,
    ics: fixture(id, title),
  })
  if (!result.success) throw new Error(result.error)
  return result.output
}

function entry(kind: TaskEntry[`kind`], id: string, title: string, status = `pending`): TaskEntry {
  return {
    seq: 1,
    key: `k`,
    entityId: id,
    kind,
    payload: {
      href: `${LIST_HREF}${id}.ics`,
      listHref: LIST_HREF,
      ics: fixture(id, title),
      baseEtag: `"e${id}"`,
    },
    baseVersion: 1,
    attempted: false,
    status: status as TaskEntry[`status`],
    queuedAt: `2026-10-09T10:00:00.000Z`,
  }
}

Deno.test(`with nothing queued the server's tasks are shown as they are`, () => {
  const server = [parsed(`1`, `Buy milk`)]
  expect(overlay(server, [])).toEqual(server)
})

Deno.test(`a queued edit replaces the text and keeps the server's etag`, () => {
  const [shown] = overlay([parsed(`1`, `Buy milk`)], [entry(`update`, `1`, `Oat milk`)])
  expect(shown.title).toBe(`Oat milk`)
  expect(shown.etag).toBe(`"e1"`)
})

Deno.test(`a queued create adds a task the server does not have yet`, () => {
  const shown = overlay([parsed(`1`, `Buy milk`)], [entry(`create`, `2`, `Pay rent`)])
  expect(shown.map((t) => t.title).sort()).toEqual([`Buy milk`, `Pay rent`])
  expect(shown.find((t) => t.uid === `2`)!.etag).toBe(``)
})

Deno.test(`a queued delete hides the task`, () => {
  const shown = overlay([parsed(`1`, `Buy milk`), parsed(`2`, `Pay rent`)], [
    entry(`delete`, `1`, `Buy milk`),
  ])
  expect(shown.map((t) => t.title)).toEqual([`Pay rent`])
})

Deno.test(`a write waiting for a choice still shows what the person wrote`, () => {
  const [shown] = overlay([parsed(`1`, `Buy milk`)], [
    entry(`update`, `1`, `Oat milk`, `conflict`),
  ])
  expect(shown.title).toBe(`Oat milk`)
})

Deno.test(`one etag always gives one version, and different etags give different ones`, () => {
  expect(versionOf(`"abc"`)).toBe(versionOf(`"abc"`))
  expect(versionOf(`"abc"`)).not.toBe(versionOf(`"abd"`))
  expect(versionOf(null)).toBe(versionOf(``))
  expect(Number.isInteger(versionOf(`W/"x"`)) && versionOf(`W/"x"`) >= 0).toBe(true)
})
