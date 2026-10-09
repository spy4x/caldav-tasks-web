/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must } from "./mount.test.tsx"
import { ListsScreen, type ListsScreenProps } from "./lists-screen.tsx"

const props = (over: Partial<ListsScreenProps> = {}): ListsScreenProps => ({
  lists: [
    { href: `/l/home/`, name: `Home`, color: `#e07a5f`, openCount: 5 },
    { href: `/l/work/`, name: `Work`, openCount: 1 },
  ],
  onOpen: () => {},
  onNewList: () => {},
  ...over,
})

Deno.test("every list shows its colour, name and open count, with the count named for screen readers", () => {
  const html = renderToString(<ListsScreen {...props()} />)
  expect(html).toContain(`#e07a5f`)
  expect(html).toMatch(/Home<\/span><span class="shrink-0[^>]*>5<span class="sr-only"> open tasks</)
  expect(html).toMatch(/Work<\/span><span class="shrink-0[^>]*>1<span class="sr-only"> open task</)
})

Deno.test("pressing a list opens it and New list is the one primary action", async () => {
  const calls: string[] = []
  await mount(
    <ListsScreen
      {...props({
        onOpen: (list) => calls.push(`open ${list.name}`),
        onNewList: () => calls.push(`new`),
      })}
    />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `li:nth-child(2) button`).click())
      await act(() => must<HTMLButtonElement>(root, `header button`).click())
      expect(calls).toEqual([`open Work`, `new`])
      expect(root.querySelector(`header`)?.textContent).toContain(`New list`)
    },
  )
})

Deno.test("with no lists it says No lists yet", () => {
  const html = renderToString(<ListsScreen {...props({ lists: [] })} />)
  expect(html).toContain(`No lists yet`)
})

Deno.test("while loading it shows a skeleton and no empty state", () => {
  const html = renderToString(<ListsScreen {...props({ lists: [], loading: true })} />)
  expect(html).toContain(`data-e2e="loading"`)
  expect(html).not.toContain(`aria-busy`)
  expect(html).not.toContain(`No lists yet`)
})
