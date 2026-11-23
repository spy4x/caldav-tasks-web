/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { homeList, setHomeList } from "./home-list.ts"

Deno.test(`the default list is the one chosen, and none (Today) once cleared or gone`, () => {
  const lists = [{ href: `/a/` }, { href: `/b/` }]
  setHomeList(`/b/`)
  expect(homeList(lists)).toEqual({ href: `/b/` })
  expect(homeList([{ href: `/a/` }])).toBeUndefined()
  setHomeList(null)
  expect(homeList(lists)).toBeUndefined()
})
