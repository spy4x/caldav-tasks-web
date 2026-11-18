/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { parseKeepingMentions } from "./mention-lists.ts"

const LISTS = [{ name: `Ceramic Courses`, href: `/lists/ceramic-courses` }]
const OPTIONS = { now: new Date(`2026-11-18T09:00:00Z`), timeZone: `UTC` }

Deno.test("a new task keeps a list's mention in its title, and other @words are still tags", () => {
  const parsed = parseKeepingMentions(`Ceramics @Ceramic Courses @studio`, LISTS, OPTIONS)
  expect(parsed.title).toBe(`Ceramics @Ceramic Courses`)
  expect(parsed.contexts).toEqual([`studio`])
})
