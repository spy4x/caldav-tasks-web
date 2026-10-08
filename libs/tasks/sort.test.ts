/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  CREATION,
  CREATION_MANUAL_ORDER,
  ERRANDS,
  fixtureTask,
  MANUAL_ORDER,
  STAMP_ONLY,
  task,
} from "./fixtures/tasksorg.ts"
import { sortTasks } from "./sort.ts"
import { SortMode, type Task } from "./types.ts"

const UTC = `UTC`
const make = (uid: string, title: string, ...lines: string[]) =>
  fixtureTask(task(uid, title, lines))
const order = (tasks: Task[], mode: SortMode, zone = UTC) =>
  sortTasks(tasks, mode, zone).map((t) => t.uid)

Deno.test("manual order on the Errands fixture is the order Tasks.org shows", () => {
  const tasks = Object.values(ERRANDS).map(fixtureTask)
  expect(order(tasks, SortMode.Manual)).toEqual(MANUAL_ORDER)
  expect(order([...tasks].reverse(), SortMode.Manual)).toEqual(MANUAL_ORDER)
})

Deno.test("manual order puts a negative position first", () => {
  const tasks = [
    make(`pos`, `B`, `X-APPLE-SORT-ORDER:5`),
    make(`neg`, `C`, `X-APPLE-SORT-ORDER:-3`),
  ]
  expect(order(tasks, SortMode.Manual)).toEqual([`neg`, `pos`])
})

Deno.test("manual order puts a never-dragged task at its creation time, among dragged ones", () => {
  const tasks = Object.values(CREATION).map(fixtureTask)
  expect(order(tasks, SortMode.Manual)).toEqual(CREATION_MANUAL_ORDER)
  expect(order([...tasks].reverse(), SortMode.Manual)).toEqual(CREATION_MANUAL_ORDER)
})

Deno.test("a task with no CREATED is placed at its DTSTAMP", () => {
  const tasks = [
    fixtureTask(STAMP_ONLY),
    make(`before`, `Z`, `X-APPLE-SORT-ORDER:812534399`),
    make(`after`, `A`, `X-APPLE-SORT-ORDER:812534401`),
  ]
  expect(order(tasks, SortMode.Manual)).toEqual([`before`, `100200410`, `after`])
})

Deno.test("manual order breaks a tie by title only", () => {
  const tasks = [
    make(`b`, `Banana`, `X-APPLE-SORT-ORDER:1`, `DUE;VALUE=DATE:20261009`, `PRIORITY:1`),
    make(`a`, `apple`, `X-APPLE-SORT-ORDER:1`, `DUE;VALUE=DATE:20261010`, `PRIORITY:9`),
  ]
  expect(order(tasks, SortMode.Manual)).toEqual([`a`, `b`])
})

Deno.test("due order is earliest first with undated tasks last, across due kinds", () => {
  const tasks = [
    make(`none`, `A`),
    make(`date`, `B`, `DUE;VALUE=DATE:20261009`),
    make(`utc`, `C`, `DUE:20261008T233000Z`),
    make(`float`, `D`, `DUE:20261009T000100`),
  ]
  expect(order(tasks, SortMode.Due)).toEqual([`utc`, `float`, `date`, `none`])
})

Deno.test("a date-only due sorts after the timed dues of its day", () => {
  const tasks = [
    make(`date`, `A`, `DUE;VALUE=DATE:20261009`),
    make(`late`, `B`, `DUE:20261009T235800Z`),
    make(`early`, `C`, `DUE:20261009T000000Z`),
    make(`next`, `D`, `DUE:20261010T000000Z`),
  ]
  expect(order(tasks, SortMode.Due)).toEqual([`early`, `late`, `date`, `next`])
})

Deno.test("due order reads a date and a floating time in the viewer's zone", () => {
  const tasks = [
    make(`date`, `A`, `DUE;VALUE=DATE:20261009`), // 23:59 on the 9th
    make(`utc`, `B`, `DUE:20261010T030000Z`),
  ]
  // 23:59 on the 9th is 23:59Z in UTC, before the UTC task, and 06:59Z on the 10th in Los Angeles,
  // after it.
  expect(order(tasks, SortMode.Due, UTC)).toEqual([`date`, `utc`])
  expect(order(tasks, SortMode.Due, `America/Los_Angeles`)).toEqual([`utc`, `date`])
})

Deno.test("due order breaks a tie by priority, high first", () => {
  const tasks = [
    make(`low`, `A`, `DUE;VALUE=DATE:20261010`, `PRIORITY:9`),
    make(`none`, `B`, `DUE;VALUE=DATE:20261010`),
    make(`high`, `C`, `DUE;VALUE=DATE:20261010`, `PRIORITY:2`),
  ]
  expect(order(tasks, SortMode.Due)).toEqual([`high`, `low`, `none`])
})

Deno.test("priority order groups 1 to 4 as high, then 5, then 6 to 9, then none", () => {
  const tasks = [
    make(`none`, `A`),
    make(`p9`, `B`, `PRIORITY:9`),
    make(`p5`, `C`, `PRIORITY:5`),
    make(`p4`, `D`, `PRIORITY:4`, `DUE;VALUE=DATE:20261011`),
    make(`p1`, `E`, `PRIORITY:1`, `DUE;VALUE=DATE:20261012`),
    make(`p6`, `F`, `PRIORITY:6`, `DUE;VALUE=DATE:20261001`),
    make(`p2`, `G`, `PRIORITY:2`),
  ]
  // Priorities 4, 1 and 2 are one band, so the title decides (D, E, G), whatever the due dates;
  // the same for 9 and 6 (B, F).
  expect(order(tasks, SortMode.Priority)).toEqual([`p4`, `p1`, `p2`, `p5`, `p9`, `p6`, `none`])
})

Deno.test("title order ignores case and accents and puts item 2 before item 10", () => {
  const tasks = [
    make(`10`, `item 10`),
    make(`b`, `banana`, `DUE;VALUE=DATE:20261005`),
    make(`2`, `Item 2`),
    make(`e`, `Écrire`),
    make(`a`, `Apple`, `DUE;VALUE=DATE:20261012`),
    make(`a2`, `apple`, `DUE;VALUE=DATE:20261001`),
  ]
  expect(order(tasks, SortMode.Title)).toEqual([`a2`, `a`, `b`, `e`, `2`, `10`])
})

Deno.test("sorting leaves the list it was given as it was", () => {
  const tasks = Object.values(ERRANDS).map(fixtureTask)
  const before = tasks.map((t) => t.uid)
  sortTasks(tasks, SortMode.Manual, UTC)
  expect(tasks.map((t) => t.uid)).toEqual(before)
})
