/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { canonicalPath, MAX_HREF_LENGTH, parentCalendar } from "./scope.ts"

Deno.test("accepts a plain absolute path, percent-encoding included, unchanged", () => {
  for (const path of ["/user/tasks/", "/user/tasks/3f2a.ics", "/user/my%20list/a%40b.ics"]) {
    expect(canonicalPath(path)).toBe(path)
  }
})

Deno.test("refuses absolute URLs, other origins and userinfo", () => {
  for (
    const href of [
      "http://localhost:5232/user/tasks/a.ics",
      "https://evil.example/user/tasks/a.ics",
      "http://test-user:test-caldav-password@localhost:5232/user/tasks/a.ics",
      "//evil.example/user/tasks/a.ics",
      "/\\evil.example/a.ics",
      "user/tasks/a.ics",
      "mailto:someone@example.com",
    ]
  ) {
    expect([href, canonicalPath(href)]).toEqual([href, null])
  }
})

Deno.test("refuses path traversal, written plainly or percent-encoded", () => {
  for (
    const href of [
      "/user/tasks/../other/a.ics",
      "/user/tasks/./a.ics",
      "/user/tasks/..",
      "/user/tasks/%2e%2e/a.ics",
      "/user/tasks/%2E./a.ics",
      "/user/tasks/.%2e",
    ]
  ) {
    expect([href, canonicalPath(href)]).toEqual([href, null])
  }
})

Deno.test("refuses encoded slashes and backslashes, which a server may decode into a separator", () => {
  for (
    const href of [
      "/user/tasks/..%2Fother%2Fa.ics",
      "/user/tasks/a%2fb.ics",
      "/user/tasks/a%5Cb.ics",
      "/user/tasks/a%5cb.ics",
      "/user/tasks/a\\b.ics",
    ]
  ) {
    expect([href, canonicalPath(href)]).toEqual([href, null])
  }
})

Deno.test("refuses a query, a fragment, spaces, control and non-ASCII characters, and bad escapes", () => {
  for (
    const href of [
      "/user/tasks/a.ics?x=1",
      "/user/tasks/a.ics#x",
      "/user/tasks/a b.ics",
      "/user/tasks/a\tb.ics",
      "/user/tasks/a%00.ics",
      "/user/tasks/a%0A.ics",
      "/user/tasks/ä.ics",
      "/user/tasks/a%zz.ics",
      "/user/tasks/a%E0%A4.ics",
    ]
  ) {
    expect([href, canonicalPath(href)]).toEqual([href, null])
  }
})

Deno.test("refuses an empty, overlong or non-string href", () => {
  expect(canonicalPath("")).toBeNull()
  expect(canonicalPath(`/${"a".repeat(MAX_HREF_LENGTH)}`)).toBeNull()
  expect(canonicalPath(undefined)).toBeNull()
  expect(canonicalPath(["/user/tasks/"])).toBeNull()
})

Deno.test("a task's calendar is its path up to the last slash; a collection has none", () => {
  expect(parentCalendar("/user/tasks/a.ics")).toBe("/user/tasks/")
  expect(parentCalendar("/user/tasks/")).toBeNull()
})
