/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must, texts } from "./mount.test.tsx"
import { dateOnly, dateTime, makeTask } from "./task-fixtures.ts"
import { TodayScreen, type TodayScreenProps } from "./today-screen.tsx"
import type { TaskList } from "@spy4x/time/ical-tasks-model"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const LISTS: TaskList[] = [
  { href: `/l/home/`, name: `Home`, color: `#e07a5f`, openCount: 2 },
  { href: `/l/work/`, name: `Work`, color: `#3d85c6`, openCount: 1 },
]
const props = (over: Partial<TodayScreenProps> = {}): TodayScreenProps => ({
  overdue: [
    makeTask(`o1`, `Send the invoice`, { listHref: `/l/work/`, due: dateOnly(`2026-10-07`) }),
  ],
  today: [
    makeTask(`t1`, `Water the plants`, { listHref: `/l/home/`, due: dateOnly(`2026-10-08`) }),
    makeTask(`t2`, `Planning notes`, {
      listHref: `/l/work/`,
      due: dateTime(`2026-10-08`, `14:00:00`),
    }),
  ],
  lists: LISTS,
  zone: `UTC`,
  now: NOW,
  onComplete: () => {},
  onOpen: () => {},
  onQuickAdd: () => {},
  ...over,
})
const titles = (root: ParentNode) => texts(root, `[data-e2e="task-open"]`)

Deno.test("overdue tasks come above today's, and the overdue heading counts them", () => {
  const html = renderToString(<TodayScreen {...props()} />)
  expect(html.indexOf(`Send the invoice`)).toBeLessThan(html.indexOf(`Water the plants`))
  expect(html).toMatch(/<h1[^>]*>.*Today/)
  expect(html).toMatch(/Overdue<\/span><span class="font-normal">1</)
  expect(html).toContain(`Due today`)
})

Deno.test("each row names its list, so tasks from several lists stay apart", () => {
  const html = renderToString(<TodayScreen {...props()} />)
  expect(html).toContain(`Home`)
  expect(html).toContain(`#e07a5f`)
  expect(html).toContain(`#3d85c6`)
})

Deno.test("the overdue heading is a button that folds the group away and back", async () => {
  await mount(<TodayScreen {...props()} />, async ({ root, act }) => {
    const toggle = must<HTMLButtonElement>(root, `[data-e2e="overdue-toggle"]`)
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(titles(root)).toHaveLength(3)
    await act(() => toggle.click())
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(titles(root)).toEqual([`Water the plants`, `Planning notes`])
    await act(() => toggle.click())
    expect(titles(root)).toHaveLength(3)
  })
})

Deno.test("with nothing overdue there is no overdue heading", () => {
  const html = renderToString(<TodayScreen {...props({ overdue: [] })} />)
  expect(html).not.toContain(`Overdue`)
  expect(html).toContain(`Due today`)
})

Deno.test("with no tasks the screen says Nothing due today and still offers quick add", () => {
  const html = renderToString(<TodayScreen {...props({ overdue: [], today: [] })} />)
  expect(html).toContain(`Nothing due today`)
  expect(html).toContain(`data-e2e="quick-add"`)
  expect(html).not.toContain(`data-e2e="task-row"`)
})

Deno.test("while loading the screen shows a skeleton announced as loading, not an empty state", () => {
  const html = renderToString(<TodayScreen {...props({ loading: true })} />)
  expect(html).toContain(`role="status" data-e2e="loading"`)
  expect(html).toContain(`Loading today's tasks`)
  expect(html).not.toContain(`Nothing due today`)
  expect(html).not.toContain(`data-e2e="task-row"`)
})

Deno.test("typing in quick add hands the title to the caller and says it is due today", async () => {
  const added: string[] = []
  const html = renderToString(<TodayScreen {...props()} />)
  expect(html).toContain(`due today`)
  await mount(
    <TodayScreen {...props({ onQuickAdd: (parsed) => added.push(parsed.title) })} />,
    async ({ root, act }) => {
      must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`).value = `Call mum`
      await act(() => must<HTMLFormElement>(root, `[data-e2e="quick-add"]`).requestSubmit())
      expect(added).toEqual([`Call mum`])
    },
  )
})

Deno.test("completing a row reports the task and the state the check asks for", async () => {
  const done: string[] = []
  await mount(
    <TodayScreen {...props({ onComplete: (task, d) => done.push(`${task.uid}:${d}`) })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLInputElement>(root, `input[data-task-check="t1"]`).click())
      expect(done).toEqual([`t1:true`])
    },
  )
})

Deno.test("the page has one h1, and the groups are headed h2", () => {
  const html = renderToString(<TodayScreen {...props()} />)
  expect(html.match(/<h1/g)).toHaveLength(1)
  expect(html.match(/<h2/g)).toHaveLength(2)
})
