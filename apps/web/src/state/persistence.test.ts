/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { parseTask } from "@spy4x/time/ical-tasks-model"
import type { AskOnce, PersistentStorageManager } from "@spy4x/platform/browser/persistent-storage"
import { watchPersistence } from "./persistence.ts"
import { serverTasks } from "./task-store.ts"

const checks = { count: 0 }

function manager(persisted: boolean, grants = true) {
  const calls: string[] = []
  const fake: PersistentStorageManager = {
    persisted: () => {
      checks.count++
      return Promise.resolve(persisted)
    },
    persist: () => {
      calls.push(`persist`)
      return Promise.resolve(grants)
    },
  }
  return { fake, calls }
}

type Notes = NonNullable<AskOnce[`store`]>

function memory(map = new Map<string, string>()): Notes {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

function oneTask() {
  const task = parseTask({
    href: `${LIST_HREF}1.ics`,
    etag: `"1"`,
    listHref: LIST_HREF,
    ics: fixture(`1`, `Buy milk`),
  })
  if (!task.success) throw new Error(task.error)
  return task.output
}

/** Starts the app's watcher with a task already cached, lets it ask, then stops it. */
async function startWithData(fake: PersistentStorageManager, notes: Notes): Promise<void> {
  serverTasks.value = [oneTask()]
  const stop = watchPersistence(fake, notes)
  try {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  } finally {
    stop()
    serverTasks.value = []
  }
}

Deno.test(`a device is asked on its first start with data and not on the next one`, async () => {
  const { fake, calls } = manager(false, false)
  const notes = new Map<string, string>()
  await startWithData(fake, memory(notes))
  expect(calls).toEqual([`persist`])
  await startWithData(fake, memory(notes))
  expect(calls).toEqual([`persist`])
})

Deno.test(`a device asked before this version is not asked again`, async () => {
  const { fake, calls } = manager(false)
  await startWithData(fake, memory(new Map([[`caldav-tasks:persistence-asked`, `1`]])))
  expect(calls).toEqual([])
})

Deno.test(`nothing is requested when the browser already keeps the data`, async () => {
  const { fake, calls } = manager(true)
  await startWithData(fake, memory())
  expect(calls).toEqual([])
})

Deno.test(`persistence is requested when the app first has a task, and not before`, async () => {
  const { fake, calls } = manager(false)
  serverTasks.value = []
  const stop = watchPersistence(fake, memory())
  try {
    await Promise.resolve()
    expect(calls).toEqual([])

    const task = parseTask({
      href: `${LIST_HREF}1.ics`,
      etag: `"1"`,
      listHref: LIST_HREF,
      ics: fixture(`1`, `Buy milk`),
    })
    if (!task.success) throw new Error(task.error)
    serverTasks.value = [task.output]
    for (let i = 0; i < 5 && calls.length === 0; i++) await Promise.resolve()
    expect(calls).toEqual([`persist`])
  } finally {
    stop()
    serverTasks.value = []
  }
})

Deno.test(`the browser is asked once while the data keeps changing`, async () => {
  const { fake } = manager(false)
  serverTasks.value = []
  checks.count = 0
  const stop = watchPersistence(fake, memory())
  try {
    const task = parseTask({
      href: `${LIST_HREF}1.ics`,
      etag: `"1"`,
      listHref: LIST_HREF,
      ics: fixture(`1`, `Buy milk`),
    })
    if (!task.success) throw new Error(task.error)
    serverTasks.value = [task.output]
    for (let i = 0; i < 5; i++) await Promise.resolve()
    serverTasks.value = []
    for (let i = 0; i < 5; i++) await Promise.resolve()
    serverTasks.value = [task.output]
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(checks.count).toBe(1)
  } finally {
    stop()
    serverTasks.value = []
  }
})
