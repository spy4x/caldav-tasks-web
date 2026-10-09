/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { SortMode } from "@spy4x/platform/universal/ical-tasks-view"
import { sortFromParam, sortToParam, tagsFromParam, tagsToParam } from "./list-filters.ts"

Deno.test(`every sort mode survives a round trip through the address`, () => {
  for (const mode of [SortMode.Manual, SortMode.Due, SortMode.Priority, SortMode.Title]) {
    expect(sortFromParam(sortToParam(mode))).toBe(mode)
  }
})

Deno.test(`manual order leaves the address clean and an unknown word falls back to it`, () => {
  expect(sortToParam(SortMode.Manual)).toBe(``)
  expect(sortFromParam(`sideways`)).toBe(SortMode.Manual)
})

Deno.test(`tags with commas and spaces survive a round trip, and no tags is an empty value`, () => {
  const tags = [`home`, `a,b`, `two words`]
  expect(tagsFromParam(tagsToParam(tags))).toEqual(tags)
  expect(tagsToParam([])).toBe(``)
  expect(tagsFromParam(``)).toEqual([])
})

Deno.test(`a damaged tag escape is kept as written instead of throwing`, () => {
  expect(tagsFromParam(`100%`)).toEqual([`100%`])
})
