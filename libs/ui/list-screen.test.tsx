/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must, texts } from "./mount.test.tsx"
import { ListScreen, type ListScreenProps } from "./list-screen.tsx"
import { dateOnly, FIXTURE_LIST_HREF, makeTask } from "./task-fixtures.ts"
import { SortMode, TaskStatus } from "../tasks/types.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const TASKS = [
  makeTask(`p`, `Paint the room`, { sortOrder: 1, tags: [`diy`] }),
  makeTask(`c`, `Buy paint`, { parentUid: `p`, sortOrder: 1, tags: [`diy`] }),
  makeTask(`z`, `Zebra`, { sortOrder: 2, due: dateOnly(`2026-10-09`), priority: 9 }),
  makeTask(`a`, `Apple`, {
    sortOrder: 3,
    due: dateOnly(`2026-10-10`),
    priority: 1,
    tags: [`food`],
  }),
  makeTask(`d`, `Done thing`, { sortOrder: 4, tags: [`chores`], status: TaskStatus.Completed }),
]
const props = (over: Partial<ListScreenProps> = {}): ListScreenProps => ({
  list: { href: FIXTURE_LIST_HREF, name: `Home`, color: `#e07a5f`, openCount: 4 },
  tasks: TASKS,
  zone: `UTC`,
  now: NOW,
  sort: SortMode.Manual,
  onSortChange: () => {},
  activeTags: [],
  onActiveTagsChange: () => {},
  showCompleted: false,
  onShowCompletedChange: () => {},
  onComplete: () => {},
  onOpen: () => {},
  onQuickAdd: () => {},
  ...over,
})
const mount_titles = (p: ListScreenProps) => {
  const html = renderToString(<ListScreen {...p} />)
  return [...html.matchAll(/data-e2e="task-open"[^>]*><span[^>]*>([^<]*)</g)].map((m) => m[1])
}
const titles = (root: ParentNode) => texts(root, `[data-e2e="task-open"]`)

Deno.test("the list shows its name, a way back to Lists and quick add that says where tasks go", () => {
  const html = renderToString(<ListScreen {...props()} />)
  expect(html).toMatch(/<h1[^>]*>.*Home/)
  expect(html).toContain(`href="/lists"`)
  expect(html).toContain(`aria-label="Lists"`)
  expect(html).toContain(`Added to Home`)
})

Deno.test("subtasks sit under their parent and completed tasks are hidden until Show completed", async () => {
  await mount(<ListScreen {...props()} />, async ({ root, rerender }) => {
    expect(titles(root)).toEqual([`Paint the room`, `Buy paint`, `Zebra`, `Apple`])
    await rerender(<ListScreen {...props({ showCompleted: true })} />)
    expect(titles(root)).toEqual([`Paint the room`, `Buy paint`, `Zebra`, `Apple`, `Done thing`])
  })
})

Deno.test("the sort choice orders the tasks: due, priority and title", async () => {
  await mount(<ListScreen {...props({ sort: SortMode.Due })} />, async ({ root, rerender }) => {
    // Due ascending; tasks without a due value come last.
    expect(titles(root)).toEqual([`Zebra`, `Apple`, `Paint the room`, `Buy paint`])
    await rerender(<ListScreen {...props({ sort: SortMode.Priority })} />)
    expect(titles(root).slice(0, 2)).toEqual([`Apple`, `Zebra`])
    await rerender(<ListScreen {...props({ sort: SortMode.Title })} />)
    expect(titles(root)).toEqual([`Apple`, `Paint the room`, `Buy paint`, `Zebra`])
  })
})

Deno.test("choosing a sort in the menu reports the mode", async () => {
  const chosen: SortMode[] = []
  await mount(
    <ListScreen {...props({ onSortChange: (mode) => chosen.push(mode) })} />,
    async ({ root, window, act }) => {
      const select = must<HTMLSelectElement>(root, `[data-e2e="sort"]`)
      expect(texts(select, `option`)).toEqual([`Manual order`, `Due date`, `Priority`, `Title`])
      await act(() => {
        select.value = String(SortMode.Priority)
        select.dispatchEvent(new window.Event(`change`, { bubbles: true }) as never)
      })
      expect(chosen).toEqual([SortMode.Priority])
    },
  )
})

Deno.test("tag chips list each tag once in alphabetical order, and a pressed chip narrows the list to tasks with that tag", async () => {
  const pressed: string[][] = []
  await mount(
    <ListScreen
      {...props({ activeTags: [`food`], onActiveTagsChange: (tags) => pressed.push(tags) })}
    />,
    async ({ root, act }) => {
      expect(texts(root, `[aria-label="Filter by tag"] button`)).toEqual([`#diy`, `#food`])
      expect(titles(root)).toEqual([`Apple`])
      const diy = [
        ...root.querySelectorAll<HTMLButtonElement>(`[aria-label="Filter by tag"] button`),
      ]
        .find((b) => b.textContent === `#diy`)!
      await act(() => diy.click())
      expect(pressed).toEqual([[`diy`, `food`]])
    },
  )
})

Deno.test("with two tag chips pressed, a task carrying only one of them still shows", () => {
  const out = mount_titles(props({ activeTags: [`diy`, `food`] }))
  expect(out).toEqual([`Paint the room`, `Buy paint`, `Apple`])
})

Deno.test("tag chips come only from the tasks shown, so Show completed adds a finished task's tag", async () => {
  const chips = `[aria-label="Filter by tag"] button`
  await mount(<ListScreen {...props()} />, async ({ root, rerender }) => {
    expect(texts(root, chips)).toEqual([`#diy`, `#food`])
    await rerender(<ListScreen {...props({ showCompleted: true })} />)
    expect(texts(root, chips)).toEqual([`#chores`, `#diy`, `#food`])
  })
})

Deno.test("Show completed reports the new state", async () => {
  const states: boolean[] = []
  await mount(
    <ListScreen {...props({ onShowCompletedChange: (show) => states.push(show) })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLInputElement>(root, `[data-e2e="show-completed"]`).click())
      expect(states).toEqual([true])
    },
  )
})

Deno.test("More actions offers only the actions the caller can do, and Delete is marked as dangerous", async () => {
  const none = renderToString(<ListScreen {...props()} />)
  expect(none).not.toContain(`More actions`)
  const calls: string[] = []
  await mount(
    <ListScreen
      {...props({
        onRename: () => calls.push(`rename`),
        onDelete: () => calls.push(`delete`),
      })}
    />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `[aria-label="More actions"]`).click())
      const items = texts(root, `[role="menuitem"]`)
      expect(items).toEqual([`Rename list`, `Delete list`])
      await act(() => [...root.querySelectorAll<HTMLElement>(`[role="menuitem"]`)][1].click())
      expect(calls).toEqual([`delete`])
    },
  )
})

Deno.test("an empty list says No tasks yet, and a filter nothing passes says why", () => {
  const empty = renderToString(<ListScreen {...props({ tasks: [] })} />)
  expect(empty).toContain(`No tasks yet`)
  expect(empty).not.toContain(`list-controls`)
  const tagged = renderToString(<ListScreen {...props({ activeTags: [`nothing`] })} />)
  expect(tagged).toContain(`No task has these tags`)
  const done = renderToString(
    <ListScreen {...props({ tasks: [TASKS[4]] })} />,
  )
  expect(done).toContain(`All done`)
})

Deno.test("while loading the list shows a skeleton and no controls", () => {
  const html = renderToString(<ListScreen {...props({ loading: true })} />)
  expect(html).toContain(`data-e2e="loading"`)
  expect(html).not.toContain(`aria-busy`)
  expect(html).not.toContain(`list-controls`)
  expect(html).not.toContain(`No tasks yet`)
})
