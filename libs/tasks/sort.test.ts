/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { ERRANDS, fixtureTask, MANUAL_ORDER, task } from "./fixtures/tasksorg.ts"
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

Deno.test("manual order puts a negative position first and a task with none last", () => {
  const tasks = [
    make(`none`, `A`),
    make(`pos`, `B`, `X-APPLE-SORT-ORDER:5`),
    make(`neg`, `C`, `X-APPLE-SORT-ORDER:-3`),
  ]
  expect(order(tasks, SortMode.Manual)).toEqual([`neg`, `pos`, `none`])
})

Deno.test("manual order breaks a tie by due date, then priority", () => {
  const tasks = [
    make(`low`, `A`, `X-APPLE-SORT-ORDER:1`, `DUE;VALUE=DATE:20261010`, `PRIORITY:9`),
    make(`high`, `B`, `X-APPLE-SORT-ORDER:1`, `DUE;VALUE=DATE:20261010`, `PRIORITY:1`),
    make(`early`, `C`, `X-APPLE-SORT-ORDER:1`, `DUE;VALUE=DATE:20261009`, `PRIORITY:9`),
  ]
  expect(order(tasks, SortMode.Manual)).toEqual([`early`, `high`, `low`])
})

Deno.test("due order is earliest first with undated tasks last, across due kinds", () => {
  const tasks = [
    make(`none`, `A`),
    make(`date`, `B`, `DUE;VALUE=DATE:20261009`),
    make(`utc`, `C`, `DUE:20261008T233000Z`),
    make(`float`, `D`, `DUE:20261009T000100`),
  ]
  expect(order(tasks, SortMode.Due)).toEqual([`utc`, `date`, `float`, `none`])
})

Deno.test("due order reads a date and a floating time in the viewer's zone", () => {
  const tasks = [
    make(`date`, `A`, `DUE;VALUE=DATE:20261009`), // midnight starting the 9th
    make(`utc`, `B`, `DUE:20261009T010000Z`),
  ]
  // In UTC the date starts first; in Los Angeles the 9th starts at 07:00Z, after the UTC task.
  expect(order(tasks, SortMode.Due, UTC)).toEqual([`date`, `utc`])
  expect(order(tasks, SortMode.Due, `America/Los_Angeles`)).toEqual([`utc`, `date`])
})

Deno.test("priority order groups 1 to 4 as high, then 5, then 6 to 9, then none", () => {
  const tasks = [
    make(`none`, `A`),
    make(`p9`, `B`, `PRIORITY:9`),
    make(`p5`, `C`, `PRIORITY:5`),
    make(`p4`, `D`, `PRIORITY:4`, `DUE;VALUE=DATE:20261011`),
    make(`p1`, `E`, `PRIORITY:1`, `DUE;VALUE=DATE:20261012`),
    make(`p6`, `F`, `PRIORITY:6`),
  ]
  // p4 and p1 are one band, so the earlier due date comes first; p9 and p6 tie and keep input order.
  expect(order(tasks, SortMode.Priority)).toEqual([`p4`, `p1`, `p5`, `p9`, `p6`, `none`])
})

Deno.test("title order ignores case and accents and puts item 2 before item 10", () => {
  const tasks = [
    make(`10`, `item 10`),
    make(`b`, `banana`),
    make(`2`, `Item 2`),
    make(`e`, `Écrire`),
    make(`a`, `Apple`),
  ]
  expect(order(tasks, SortMode.Title)).toEqual([`a`, `b`, `e`, `2`, `10`])
})

Deno.test("sorting leaves the list it was given as it was", () => {
  const tasks = Object.values(ERRANDS).map(fixtureTask)
  const before = tasks.map((t) => t.uid)
  sortTasks(tasks, SortMode.Manual, UTC)
  expect(tasks.map((t) => t.uid)).toEqual(before)
})
