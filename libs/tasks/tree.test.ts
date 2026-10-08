/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { ERRANDS, fixtureTask, MANUAL_ORDER, task } from "./fixtures/tasksorg.ts"
import { sortTasks } from "./sort.ts"
import { buildTree, flattenTree } from "./tree.ts"
import { SortMode, type TaskNode } from "./types.ts"

const make = (uid: string, parent?: string, order?: number) =>
  fixtureTask(task(uid, `Task ${uid}`, [
    ...(parent ? [`RELATED-TO:${parent}`] : []),
    ...(order === undefined ? [] : [`X-APPLE-SORT-ORDER:${order}`]),
  ]))
const shape = (nodes: TaskNode[]): unknown[] =>
  nodes.map((node) => node.children.length ? [node.task.uid, shape(node.children)] : node.task.uid)
const count = (nodes: TaskNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + count(node.children), 0)

Deno.test("nests subtasks under the parent named by RELATED-TO", () => {
  const tree = buildTree([make(`a`), make(`b`, `a`), make(`c`, `b`), make(`d`)], `UTC`)
  expect(shape(tree)).toEqual([[`a`, [[`b`, [`c`]]]], `d`])
})

Deno.test("an orphan whose parent is missing is shown at the top", () => {
  const tree = buildTree([make(`a`), make(`orphan`, `gone`)], `UTC`)
  expect(shape(tree)).toEqual([`a`, `orphan`])
})

Deno.test("a cycle is cut at its first task and shows every task once", () => {
  const tree = buildTree([make(`a`, `b`), make(`b`, `a`), make(`c`)], `UTC`)
  expect(shape(tree)).toEqual([[`a`, [`b`]], `c`])
  expect(count(tree)).toBe(3)
})

Deno.test("a longer cycle with a branch hanging off it loses no task", () => {
  const tasks = [make(`x`, `z`), make(`y`, `x`), make(`z`, `y`), make(`leaf`, `y`)]
  const tree = buildTree(tasks, `UTC`)
  expect(count(tree)).toBe(4)
  expect(tree.map((node) => node.task.uid)).toEqual([`x`])
})

Deno.test("a task that is its own parent is shown at the top", () => {
  expect(shape(buildTree([make(`a`, `a`)], `UTC`))).toEqual([`a`])
})

Deno.test("two tasks with one UID are both shown, the children go to the first", () => {
  const tree = buildTree([make(`a`), make(`a`), make(`kid`, `a`)], `UTC`)
  expect(tree.length).toBe(2)
  expect(count(tree)).toBe(3)
  expect(tree[0].children.map((node) => node.task.uid)).toEqual([`kid`])
})

Deno.test("subtasks are in manual order, whatever order the list is given in", () => {
  const tree = buildTree(
    [make(`p`), make(`b`, `p`, 20), make(`a`, `p`, 10), make(`c`, `p`, 30)],
    `UTC`,
  )
  expect(tree[0].children.map((node) => node.task.uid)).toEqual([`a`, `b`, `c`])
})

Deno.test("the top level keeps the order of the list", () => {
  const tree = buildTree([make(`b`, undefined, 20), make(`a`, undefined, 10)], `UTC`)
  expect(tree.map((node) => node.task.uid)).toEqual([`b`, `a`])
})

Deno.test("the Errands fixture nests two subtasks, shows an orphan and survives its cycle", () => {
  const sorted = sortTasks(Object.values(ERRANDS).map(fixtureTask), SortMode.Manual, `UTC`)
  const tree = buildTree(sorted, `UTC`)
  expect(count(tree)).toBe(MANUAL_ORDER.length)
  expect(shape(tree)).toEqual([
    `100200303`,
    `100200305`,
    [`100200300`, [`100200302`, `100200301`]],
    [`100200306`, [`100200307`]],
    `100200304`,
  ])
})

Deno.test("flattening gives parents before children with their depth, and honours collapsed", () => {
  const tree = buildTree([make(`a`), make(`b`, `a`), make(`c`, `b`), make(`d`)], `UTC`)
  expect(flattenTree(tree).map((row) => [row.task.uid, row.depth])).toEqual([
    [`a`, 0],
    [`b`, 1],
    [`c`, 2],
    [`d`, 0],
  ])
  expect(flattenTree(tree, new Set([`b`])).map((row) => row.task.uid)).toEqual([`a`, `b`, `d`])
})
