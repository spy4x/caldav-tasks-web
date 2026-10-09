/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { parseTask } from "@spy4x/time/ical-tasks-model"
import {
  type AskedStore,
  requestPersistence,
  type StorageManagerLike,
  watchPersistence,
} from "./persistence.ts"
import { serverTasks } from "./task-store.ts"

const checks = { count: 0 }

function manager(persisted: boolean, grants = true) {
  const calls: string[] = []
  const fake: StorageManagerLike = {
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

function memory(): AskedStore {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

Deno.test(`persistence is requested once per device and the answer is returned`, async () => {
  const { fake, calls } = manager(false)
  const asked = memory()
  expect(await requestPersistence(fake, asked)).toBe(true)
  expect(await requestPersistence(fake, asked)).toBe(false)
  expect(calls).toEqual([`persist`])
})

Deno.test(`nothing is requested when the browser already keeps the data`, async () => {
  const { fake, calls } = manager(true)
  expect(await requestPersistence(fake, memory())).toBe(true)
  expect(calls).toEqual([])
})

Deno.test(`a browser without the storage API, or one that throws, gets no request and no error`, async () => {
  expect(await requestPersistence(undefined as unknown as StorageManagerLike, memory())).toBe(false)
  const throwing: StorageManagerLike = {
    persisted: () => Promise.reject(new Error(`blocked`)),
    persist: () => Promise.reject(new Error(`blocked`)),
  }
  expect(await requestPersistence(throwing, memory())).toBe(false)
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
