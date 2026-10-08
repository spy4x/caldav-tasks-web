/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { AppFrame, NAV_ITEMS, navKey, PATHS, PlaceholderPage } from "./frame.tsx"

Deno.test("the navigation lists Today, Upcoming, Lists, Search and More in that order", () => {
  expect(NAV_ITEMS.map((item) => item.label)).toEqual([
    "Today",
    "Upcoming",
    "Lists",
    "Search",
    "More",
  ])
})

Deno.test("the frame renders every destination as a link and the page inside <main>", () => {
  const html = renderToString(
    <AppFrame currentPath={PATHS.upcoming}>
      <PlaceholderPage title="Upcoming" />
    </AppFrame>,
  )
  for (const item of NAV_ITEMS) expect(html).toContain(`href="${item.href}"`)
  expect(html).toMatch(/<main[^>]*>[\s\S]*<h1[^>]*>Upcoming<\/h1>[\s\S]*<\/main>/)
})

Deno.test("marks only the current destination with aria-current", () => {
  const html = renderToString(
    <AppFrame currentPath={PATHS.lists}>
      <PlaceholderPage title="Lists" />
    </AppFrame>,
  )
  // The rail and the tab bar each draw the current entry once.
  expect(html.match(/aria-current="page"/g)).toHaveLength(2)
})

Deno.test("maps a path to its destination, a sub-path to its parent and a stranger to none", () => {
  expect(navKey("/")).toBe("today")
  expect(navKey("/upcoming")).toBe("upcoming")
  expect(navKey("/lists/work")).toBe("lists")
  expect(navKey("/listsfoo")).toBeUndefined()
  expect(navKey("/elsewhere")).toBeUndefined()
  expect(navKey(undefined)).toBeUndefined()
})
