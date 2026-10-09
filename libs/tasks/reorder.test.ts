/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { SortMode, sortTasks } from "@spy4x/platform/universal/ical-tasks-view"
import { TaskStatus } from "@spy4x/time/ical-tasks-model"
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
  const writes = reorderWrites(tasks, tasks, `a`, 2, ZONE)
  expect(writes.map(({ task }) => task.uid)).toEqual([`a`])
  expect(titlesAfter(tasks, writes)).toEqual([`Bravo`, `Charlie`, `Alpha`])
})

Deno.test(`a task dropped between two others gets a value between theirs`, () => {
  const tasks = [...spaced(), makeTask(`d`, `Delta`, { sortOrder: 400 })]
  const writes = reorderWrites(tasks, tasks, `d`, 1, ZONE)
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
  const writes = reorderWrites(tasks, tasks, `a`, 1, ZONE)
  expect(titlesAfter(tasks, writes)).toEqual([`Bravo`, `Alpha`, `Charlie`])
})

Deno.test(`dropping a task where it already is writes nothing`, () => {
  const all = spaced()
  expect(reorderWrites(all, all, `b`, 1, ZONE)).toEqual([])
})

Deno.test(`each write names the task it belongs to and carries only the sort order`, () => {
  const tasks = spaced()
  const [write] = reorderWrites(tasks, tasks, `a`, 2, ZONE)
  expect(write.task).toBe(tasks[0])
  expect(Object.keys(write.edit)).toEqual([`sortOrder`])
})

Deno.test(`a hidden completed task keeps its place between the same visible tasks after a drag`, () => {
  const all = [
    makeTask(`a`, `Alpha`, { sortOrder: 10 }),
    makeTask(`b`, `Bravo`, { sortOrder: 11 }),
    makeTask(`h`, `Hidden`, { sortOrder: 12, status: TaskStatus.Completed }),
    makeTask(`c`, `Charlie`, { sortOrder: 13 }),
    makeTask(`d`, `Delta`, { sortOrder: 14 }),
  ]
  const visible = all.filter((task) => task.uid !== `h`)
  const writes = reorderWrites(all, visible, `d`, 1, ZONE)
  // Alpha, Delta, Bravo, Hidden, Charlie: the hidden task still sits between Bravo and Charlie.
  expect(titlesAfter(all, writes)).toEqual([`Alpha`, `Delta`, `Bravo`, `Hidden`, `Charlie`])
})

Deno.test(`a task dropped at the top of the visible tasks goes before the first visible one, past hidden ones`, () => {
  const all = [
    makeTask(`h`, `Hidden`, { sortOrder: 10, status: TaskStatus.Completed }),
    makeTask(`a`, `Alpha`, { sortOrder: 11 }),
    makeTask(`b`, `Bravo`, { sortOrder: 12 }),
  ]
  const visible = all.filter((task) => task.uid !== `h`)
  const writes = reorderWrites(all, visible, `b`, 0, ZONE)
  expect(titlesAfter(all, writes)).toEqual([`Hidden`, `Bravo`, `Alpha`])
})

Deno.test(`only siblings of the moved task are compared, not tasks under other parents`, () => {
  const all = [
    makeTask(`a`, `Alpha`, { sortOrder: 10 }),
    makeTask(`s`, `Sub`, { parentUid: `a`, sortOrder: 11 }),
    makeTask(`b`, `Bravo`, { sortOrder: 12 }),
  ]
  const writes = reorderWrites(all, [all[0], all[2]], `b`, 0, ZONE)
  expect(writes.map(({ task }) => task.uid)).not.toContain(`s`)
})
