/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { quickAddTarget } from "./use-quick-add.ts"

const LISTS = [{ href: `/a/` }, { href: `/b/` }]

Deno.test(`a quick add with no list named goes to the first list`, () => {
  expect(quickAddTarget(LISTS, true)).toEqual({ listHref: `/a/` })
})

Deno.test(`a quick add in a named list goes there`, () => {
  expect(quickAddTarget(LISTS, true, `/b/`)).toEqual({ listHref: `/b/` })
})

Deno.test(`a quick add before the lists have loaded says they are loading`, () => {
  expect(quickAddTarget([], false)).toEqual({
    error: `Your lists are still loading. Try again in a moment.`,
  })
})

Deno.test(`a quick add with no lists at all says there is none`, () => {
  expect(quickAddTarget([], true)).toEqual({ error: `There is no list to add the task to yet.` })
})
