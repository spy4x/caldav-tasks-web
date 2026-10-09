/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must, texts } from "./mount.test.tsx"
import { makeTask } from "./task-fixtures.ts"
import { SearchScreen, type SearchScreenProps } from "./search-screen.tsx"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const props = (over: Partial<SearchScreenProps> = {}): SearchScreenProps => ({
  tasks: [
    makeTask(`1`, `Buy paint`, { listHref: `/l/home/`, tags: [`diy`] }),
    makeTask(`2`, `Paint report`, { listHref: `/l/work/` }),
    makeTask(`3`, `Call mum`, { listHref: `/l/home/`, notes: `About the paint colour` }),
    makeTask(`4`, `Water plants`, { listHref: `/l/home/` }),
  ],
  lists: [
    { href: `/l/work/`, name: `Work`, openCount: 1 },
    { href: `/l/home/`, name: `Home`, color: `#e07a5f`, openCount: 3 },
  ],
  zone: `UTC`,
  now: NOW,
  query: `paint`,
  onQueryChange: () => {},
  onComplete: () => {},
  onOpen: () => {},
  ...over,
})

Deno.test("results are grouped by list in the lists' order and match titles, notes and tags", async () => {
  await mount(<SearchScreen {...props()} />, async ({ root }) => {
    expect(texts(root, `h2`)).toEqual([`Work`, `Home`])
    const groups = [...root.querySelectorAll(`section`)].map((s) =>
      texts(s, `[data-e2e="task-open"]`)
    )
    expect(groups).toEqual([[`Paint report`], [`Buy paint`, `Call mum`]])
    expect(texts(root, `[data-e2e="search-count"]`)).toEqual([`3 results`])
  })
})

Deno.test("the result count counts only the tasks shown, not ones in a list that is not shown", async () => {
  const stray = makeTask(`9`, `Paint the fence`, { listHref: `/l/gone/` })
  await mount(
    <SearchScreen {...props({ tasks: [...props().tasks, stray] })} />,
    async ({ root }) => {
      expect(texts(root, `[data-e2e="task-open"]`)).toHaveLength(3)
      expect(texts(root, `[data-e2e="search-count"]`)).toEqual([`3 results`])
    },
  )
})

Deno.test("a tag alone finds a task", async () => {
  await mount(<SearchScreen {...props({ query: `diy` })} />, async ({ root }) => {
    expect(texts(root, `[data-e2e="task-open"]`)).toEqual([`Buy paint`])
    expect(texts(root, `[data-e2e="search-count"]`)).toEqual([`1 result`])
  })
})

Deno.test("typing in the field reports the query", async () => {
  const typed: string[] = []
  await mount(
    <SearchScreen {...props({ query: ``, onQueryChange: (q) => typed.push(q) })} />,
    async ({ root, window, act }) => {
      const input = must<HTMLInputElement>(root, `[data-e2e="search-input"]`)
      expect(input.getAttribute(`aria-label`)).toBe(`Search tasks`)
      await act(() => {
        input.value = `plants`
        input.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
      })
      expect(typed).toEqual([`plants`])
    },
  )
})

Deno.test("a blank query invites a search and a query nothing matches says so", () => {
  const blank = renderToString(<SearchScreen {...props({ query: `  ` })} />)
  expect(blank).toContain(`Search your tasks`)
  expect(blank).not.toContain(`data-e2e="task-row"`)
  const none = renderToString(<SearchScreen {...props({ query: `zzz` })} />)
  expect(none).toContain(`No tasks match`)
  expect(none).toContain(`“zzz”`)
})

Deno.test("while loading it shows a skeleton and announces no count", () => {
  const html = renderToString(<SearchScreen {...props({ loading: true })} />)
  expect(html).toContain(`data-e2e="loading"`)
  expect(html).not.toContain(`aria-busy`)
  expect(html).not.toContain(`results`)
})

Deno.test("completing a result reports the task and the state the check asks for", async () => {
  const done: string[] = []
  await mount(
    <SearchScreen {...props({ onComplete: (task, d) => done.push(`${task.uid}:${d}`) })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLInputElement>(root, `input[data-task-check="2"]`).click())
      expect(done).toEqual([`2:true`])
    },
  )
})
