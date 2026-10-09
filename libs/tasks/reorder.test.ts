/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  buildTree,
  flattenTree,
  SortMode,
  sortTasks,
} from "@spy4x/platform/universal/ical-tasks-view"
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

/** The titles as the list shows them after the writes, subtasks under their parent, in manual order. */
function treeAfter(
  tasks: ReturnType<typeof makeTask>[],
  writes: ReturnType<typeof reorderWrites>,
) {
  const moved = new Map(writes.map(({ task, edit }) => [task.uid, edit.sortOrder!]))
  const next = tasks.map((task) =>
    moved.has(task.uid) ? { ...task, sortOrder: moved.get(task.uid) } : task
  )
  const nodes = buildTree(sortTasks(next, SortMode.Manual, ZONE), ZONE)
  return flattenTree(nodes, new Set()).map(({ task }) => task.title)
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
    makeTask(`b`, `Bravo`, { sortOrder: 11 }),
    makeTask(`s`, `Sub`, { parentUid: `b`, sortOrder: 12 }),
  ]
  const writes = reorderWrites(all, [all[0], all[1]], `a`, 1, ZONE)
  expect(writes.map(({ task }) => task.uid)).toEqual([`a`])
})

/** A, an open subtask S whose parent is completed and so not loaded, and B, as the list loads them. */
const orphan = () => [
  makeTask(`a`, `Alpha`, { sortOrder: 10 }),
  makeTask(`s`, `Sub`, { parentUid: `p`, sortOrder: 30 }),
  makeTask(`b`, `Bravo`, { sortOrder: 40 }),
]

Deno.test(`a task dropped below a subtask whose parent is not loaded lands right below it`, () => {
  const all = orphan()
  const writes = reorderWrites(all, all, `b`, 1, ZONE)
  expect(treeAfter(all, writes)).toEqual([`Alpha`, `Bravo`, `Sub`])
})

Deno.test(`a subtask whose parent is not loaded moves among the top-level tasks`, () => {
  const all = orphan()
  expect(treeAfter(all, reorderWrites(all, all, `s`, 2, ZONE))).toEqual([`Alpha`, `Bravo`, `Sub`])
  expect(treeAfter(all, reorderWrites(all, all, `a`, 1, ZONE))).toEqual([`Sub`, `Alpha`, `Bravo`])
})

/** A tag filter on "home" hides the parent P, so its subtask S shows at the top level. */
const filtered = () => {
  const home = { tags: [`home`] }
  const all = [
    makeTask(`a`, `Alpha`, { sortOrder: 10, ...home }),
    makeTask(`p`, `Parent`, { sortOrder: 20 }),
    makeTask(`s`, `Sub`, { parentUid: `p`, sortOrder: 30, ...home }),
    makeTask(`b`, `Bravo`, { sortOrder: 40, ...home }),
    makeTask(`c`, `Charlie`, { sortOrder: 50, ...home }),
  ]
  const shown = all.filter((task) => task.tags.includes(`home`))
  const visible = buildTree(sortTasks(shown, SortMode.Manual, ZONE), ZONE).map(({ task }) => task)
  return { all, shown, visible }
}

Deno.test(`under a tag filter that hides a parent, a task dropped below its subtask lands right below it`, () => {
  const { all, shown, visible } = filtered()
  expect(visible.map((task) => task.title)).toEqual([`Alpha`, `Sub`, `Bravo`, `Charlie`])
  const writes = reorderWrites(all, visible, `c`, 2, ZONE)
  expect(treeAfter(shown, writes)).toEqual([`Alpha`, `Sub`, `Charlie`, `Bravo`])
  // With the filter cleared, Charlie sits right after the parent and its subtask.
  expect(treeAfter(all, writes)).toEqual([`Alpha`, `Parent`, `Sub`, `Charlie`, `Bravo`])
})

Deno.test(`under a tag filter that hides a parent, its subtask moves among the tasks shown`, () => {
  const { all, shown, visible } = filtered()
  const down = reorderWrites(all, visible, `s`, 3, ZONE)
  expect(treeAfter(shown, down)).toEqual([`Alpha`, `Bravo`, `Charlie`, `Sub`])
  expect(treeAfter(all, down)).toEqual([`Alpha`, `Parent`, `Sub`, `Bravo`, `Charlie`])
  const up = reorderWrites(all, visible, `a`, 1, ZONE)
  expect(treeAfter(shown, up)).toEqual([`Sub`, `Alpha`, `Bravo`, `Charlie`])
  expect(treeAfter(all, up)).toEqual([`Parent`, `Sub`, `Alpha`, `Bravo`, `Charlie`])
})

Deno.test(`under a tag filter, the hidden subtasks of a hidden parent do not count among the top-level tasks`, () => {
  const all = [
    makeTask(`a`, `Alpha`, { sortOrder: 10, tags: [`home`] }),
    makeTask(`p`, `Parent`, { sortOrder: 20 }),
    makeTask(`s`, `Sub`, { parentUid: `p`, sortOrder: 30, tags: [`home`] }),
    makeTask(`t`, `Twin`, { parentUid: `p`, sortOrder: 31 }),
    makeTask(`b`, `Bravo`, { sortOrder: 32, tags: [`home`] }),
  ]
  // Bravo already sits right below Sub on screen, so dropping it there writes nothing.
  expect(reorderWrites(all, [all[0], all[2], all[4]], `b`, 2, ZONE)).toEqual([])
})
