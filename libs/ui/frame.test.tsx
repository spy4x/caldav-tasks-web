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

Deno.test("every destination is a link to its page; a plain click goes to navigate, a Ctrl click is the browser's", async () => {
  const window = new Window({ url: "http://app.localhost/" })
  const own = globalThis.document
  const ownLocation = Object.getOwnPropertyDescriptor(globalThis, "location")
  Object.assign(globalThis, { document: window.document })
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true })
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
    expect(entries.map((entry) => `${entry.tagName} ${entry.getAttribute("href")}`)).toEqual(
      NAV_ITEMS.map((item) => `A ${item.path}`),
    )
    const lists = entries.find((entry) => entry.textContent?.includes("Lists"))!
    const inNewTab = new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    })
    await act(() => {
      lists.dispatchEvent(inNewTab)
    })
    expect(opened).toEqual([])
    expect(inNewTab.defaultPrevented).toBe(false)
    const plain = new window.MouseEvent("click", { bubbles: true, cancelable: true })
    await act(() => {
      lists.dispatchEvent(plain)
    })
    expect(opened).toEqual([PATHS.lists])
    expect(plain.defaultPrevented).toBe(true)
  } finally {
    await act(() => render(null, root as unknown as HTMLElement))
    Object.assign(globalThis, { document: own })
    if (ownLocation) Object.defineProperty(globalThis, "location", ownLocation)
    else Reflect.deleteProperty(globalThis, "location")
    await window.happyDOM.close()
  }
})
