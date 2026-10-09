/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { SortMode, sortTasks } from "@spy4x/platform/universal/ical-tasks-view"
import { makeTask } from "../ui/task-fixtures.ts"
import { reorderWrites } from "./reorder.ts"

const ZONE = `UTC`

/** The titles in manual order after the writes are applied, the way a reload would show them. */
function titlesAfter(
  tasks: ReturnType<typeof makeTask>[],
  writes: ReturnType<typeof reorderWrites>,
) {
  const moved = new Map(writes.map(({ task, edit }) => [task.uid, edit.sortOrder!]))
  const next = tasks.map((task) =>
    moved.has(task.uid) ? { ...task, sortOrder: moved.get(task.uid) } : task
  )
  return sortTasks(next, SortMode.Manual, ZONE).map((task) => task.title)
}

const spaced = () => [
  makeTask(`a`, `Alpha`, { sortOrder: 100 }),
  makeTask(`b`, `Bravo`, { sortOrder: 200 }),
  makeTask(`c`, `Charlie`, { sortOrder: 300 }),
]

Deno.test(`dragging a task writes only that task and the list then shows the new order`, () => {
  const tasks = spaced()
  const writes = reorderWrites(tasks, `a`, 2, ZONE)
  expect(writes.map(({ task }) => task.uid)).toEqual([`a`])
  expect(titlesAfter(tasks, writes)).toEqual([`Bravo`, `Charlie`, `Alpha`])
})

Deno.test(`a task dropped between two others gets a value between theirs`, () => {
  const tasks = [...spaced(), makeTask(`d`, `Delta`, { sortOrder: 400 })]
  const writes = reorderWrites(tasks, `d`, 1, ZONE)
  expect(writes.map(({ task }) => task.uid)).toEqual([`d`])
  expect(writes[0].edit.sortOrder).toBeGreaterThan(100)
  expect(writes[0].edit.sortOrder).toBeLessThan(200)
})

Deno.test(`neighbours with no room between them are spread so the order still holds`, () => {
  const tasks = [
    makeTask(`a`, `Alpha`, { sortOrder: 5 }),
    makeTask(`b`, `Bravo`, { sortOrder: 6 }),
    makeTask(`c`, `Charlie`, { sortOrder: 7 }),
  ]
  const writes = reorderWrites(tasks, `a`, 1, ZONE)
  expect(titlesAfter(tasks, writes)).toEqual([`Bravo`, `Alpha`, `Charlie`])
})

Deno.test(`dropping a task where it already is writes nothing`, () => {
  expect(reorderWrites(spaced(), `b`, 1, ZONE)).toEqual([])
})

Deno.test(`each write names the task it belongs to and carries only the sort order`, () => {
  const tasks = spaced()
  const [write] = reorderWrites(tasks, `a`, 2, ZONE)
  expect(write.task).toBe(tasks[0])
  expect(Object.keys(write.edit)).toEqual([`sortOrder`])
})
