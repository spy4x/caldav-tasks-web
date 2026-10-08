/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fixtureTask, task } from "./fixtures/tasksorg.ts"
import { searchTasks } from "./search.ts"

const make = (uid: string, title: string, ...lines: string[]) =>
  fixtureTask(task(uid, title, lines))
const find = (query: string) =>
  searchTasks(
    [
      make(`title`, `Book the Café table`),
      make(`notes`, `Plain`, `DESCRIPTION:Ask about the cafe menu`),
      make(`tag`, `Plain too`, `CATEGORIES:Errands,Café`),
      make(`vn`, `Trả Đồng Nguyễn`),
      make(`other`, `Nothing here`, `DESCRIPTION:Water`),
    ],
    query,
  ).map((t) => t.uid)

Deno.test("finds a word in the title, the notes and the tags", () => {
  expect(find(`cafe`)).toEqual([`title`, `notes`, `tag`])
  expect(find(`menu`)).toEqual([`notes`])
  expect(find(`errands`)).toEqual([`tag`])
})

Deno.test("ignores case", () => {
  expect(find(`TABLE`)).toEqual([`title`])
})

Deno.test("ignores accents in the query and in the text", () => {
  expect(find(`café`)).toEqual([`title`, `notes`, `tag`])
  expect(find(`dong nguyen`)).toEqual([`vn`])
  expect(find(`TRẢ ĐỒNG`)).toEqual([`vn`])
})

Deno.test("every word of the query must match, in any of the three fields", () => {
  expect(find(`book menu`)).toEqual([])
  expect(find(`plain errands`)).toEqual([`tag`])
})

Deno.test("a blank query matches nothing", () => {
  expect(find(``)).toEqual([])
  expect(find(`   `)).toEqual([])
})
