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
  // The tab bar draws the current entry once; the sidebar is the caller's.
  expect(html.match(/aria-current="page"/g)).toHaveLength(1)
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
    const bar = root.querySelector(`[data-e2e="tab-bar"]`)!
    const entries = [...bar.querySelectorAll(`[data-e2e="tab"]`)]
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

Deno.test("the sidebar hides and comes back, and the frame says so for the screens", async () => {
  const window = new Window({ url: "http://app.localhost/" })
  const own = globalThis.document
  Object.assign(globalThis, { document: window.document })
  const root = window.document.createElement("div")
  window.document.body.append(root)
  try {
    await act(() => render(<AppFrame sidebar={<p>Lists</p>}>page</AppFrame>, root as never))
    const frame = () => root.firstElementChild!
    const aside = () => root.querySelector(`[data-e2e="sidebar"]`)
    expect(frame().hasAttribute(`data-sidebar-hidden`)).toBe(false)
    expect(aside()).not.toBeNull()
    await act(() =>
      (root.querySelector(`[data-e2e="sidebar-hide"]`) as unknown as HTMLElement).click()
    )
    expect(frame().hasAttribute(`data-sidebar-hidden`)).toBe(true)
    expect(aside()).toBeNull()
    expect(root.querySelector(`[data-e2e="top-bar"]`)).not.toBeNull()
    await act(() =>
      (root.querySelector(`[data-e2e="sidebar-show"]`) as unknown as HTMLElement).click()
    )
    expect(frame().hasAttribute(`data-sidebar-hidden`)).toBe(false)
    expect(root.querySelector(`[data-e2e="sidebar-show"]`)).toBeNull()
  } finally {
    render(null, root as never)
    Object.assign(globalThis, { document: own })
    await window.happyDOM.close()
  }
})
