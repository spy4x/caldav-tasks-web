/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
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

Deno.test("the frame lists every destination and the page inside <main>", () => {
  const html = renderToString(
    <AppFrame currentPath={PATHS.upcoming}>
      <PlaceholderPage title="Upcoming" />
    </AppFrame>,
  )
  for (const item of NAV_ITEMS) expect(html).toContain(item.label)
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

Deno.test("choosing a destination hands its path to navigate and renders no link", async () => {
  const window = new Window({ url: "http://app.localhost/" })
  const own = globalThis.document
  Object.assign(globalThis, { document: window.document })
  const root = window.document.createElement("div")
  window.document.body.append(root)
  const opened: string[] = []
  try {
    await act(() =>
      render(
        <AppFrame currentPath={PATHS.today} navigate={(path) => opened.push(path)}>
          <PlaceholderPage title="Today" />
        </AppFrame>,
        root as unknown as HTMLElement,
      )
    )
    const rail = root.querySelector(`[data-e2e="rail-shell-rail"]`)!
    const entries = [...rail.querySelectorAll(`[data-e2e="rail-shell-entry"]`)]
    const lists = entries.find((entry) => entry.textContent?.includes("Lists"))!
    await act(() => {
      lists.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
    })
    expect(opened).toEqual([PATHS.lists])
    expect(rail.querySelectorAll(`a[href]`)).toHaveLength(0)
  } finally {
    await act(() => render(null, root as unknown as HTMLElement))
    Object.assign(globalThis, { document: own })
    await window.happyDOM.close()
  }
})
