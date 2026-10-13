/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { pageTitle } from "./page-title.ts"

const data = {
  lists: [{ href: `/dav/me/errands/`, name: `Errands` }],
  tasks: [{ uid: `a@b/c`, title: `Buy milk` }],
  loaded: true,
}

Deno.test(`each destination's tab title names it before the app`, () => {
  expect(
    [`/`, `/upcoming`, `/lists`, `/search`, `/settings`, `/new-list`].map((path) =>
      pageTitle(path, data)
    ),
  ).toEqual([
    `Today · Tasks`,
    `Upcoming · Tasks`,
    `Lists · Tasks`,
    `Search · Tasks`,
    `Settings · Tasks`,
    `New list · Tasks`,
  ])
})

Deno.test(`a list page is titled with the list's name, and its settings say so too`, () => {
  expect(pageTitle(`/lists/errands`, data)).toBe(`Errands · Tasks`)
  expect(pageTitle(`/lists/errands/settings`, data)).toBe(`List settings · Errands · Tasks`)
})

Deno.test(`a task page is titled with the task's title, whatever its UID holds`, () => {
  expect(pageTitle(`/tasks/${encodeURIComponent(`a@b/c`)}`, data)).toBe(`Buy milk · Tasks`)
})

Deno.test(`a list or task that is not loaded yet leaves the app's name alone, and a missing one says Not found`, () => {
  const loading = { lists: [], tasks: [], loaded: false }
  expect(pageTitle(`/lists/errands`, loading)).toBe(`Tasks`)
  expect(pageTitle(`/tasks/1`, loading)).toBe(`Tasks`)
  expect(pageTitle(`/lists/gone`, data)).toBe(`Not found · Tasks`)
  expect(pageTitle(`/tasks/gone`, data)).toBe(`Not found · Tasks`)
  expect(pageTitle(`/nowhere`, data)).toBe(`Not found · Tasks`)
})
