/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { focused, mount, must, texts } from "./mount.test.tsx"
import { CompletedRange, ListScreen, type ListScreenProps } from "./list-screen.tsx"
import { dateOnly, FIXTURE_LIST_HREF, makeTask } from "./task-fixtures.ts"
import { SortMode } from "@spy4x/platform/universal/ical-tasks-view"
import { TaskStatus } from "@spy4x/time/ical-tasks-model"

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
  completedRange: CompletedRange.Today,
  onCompletedRangeChange: () => {},
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

Deno.test("subtasks sit under their parent and completed tasks show below, in their own section", async () => {
  await mount(<ListScreen {...props()} />, async ({ root, rerender }) => {
    expect(titles(root)).toEqual([`Paint the room`, `Buy paint`, `Zebra`, `Apple`])
    expect(root.querySelector(`[data-e2e="completed-section"] [data-e2e="task-open"]`)).toBeNull()
    await rerender(<ListScreen {...props({ completedRange: CompletedRange.All })} />)
    expect(texts(root, `[data-e2e="completed-section"] [data-e2e="task-open"]`)).toEqual([
      `Done thing`,
    ])
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

const TAG_OPTIONS = `[data-e2e="tag-filter"] option`

Deno.test("the tag filter lists each tag once in alphabetical order, and picking one narrows the list to it", async () => {
  const picked: string[][] = []
  await mount(
    <ListScreen
      {...props({ activeTags: [`food`], onActiveTagsChange: (tags) => picked.push(tags) })}
    />,
    async ({ root, window, act }) => {
      expect(texts(root, TAG_OPTIONS)).toEqual([`Filter`, `#diy`, `#food`])
      expect(titles(root)).toEqual([`Apple`])
      const select = must<HTMLSelectElement>(root, `[data-e2e="tag-filter"]`)
      await act(() => {
        select.value = `diy`
        select.dispatchEvent(new window.Event(`change`, { bubbles: true }) as never)
      })
      await act(() => {
        select.value = ``
        select.dispatchEvent(new window.Event(`change`, { bubbles: true }) as never)
      })
      expect(picked).toEqual([[`diy`], []])
    },
  )
})

Deno.test("with two tag chips pressed, a task carrying only one of them still shows", () => {
  const out = mount_titles(props({ activeTags: [`diy`, `food`] }))
  expect(out).toEqual([`Paint the room`, `Buy paint`, `Apple`])
})

Deno.test("the tag filter offers only the tags of tasks shown, so showing completed adds a finished task's tag", async () => {
  await mount(<ListScreen {...props()} />, async ({ root, rerender }) => {
    expect(texts(root, TAG_OPTIONS)).toEqual([`Filter`, `#diy`, `#food`])
    await rerender(<ListScreen {...props({ completedRange: CompletedRange.All })} />)
    expect(texts(root, TAG_OPTIONS)).toEqual([`Filter`, `#chores`, `#diy`, `#food`])
  })
})

Deno.test("a chosen tag stays chosen when no shown task carries it, so it can be cleared", async () => {
  await mount(<ListScreen {...props({ activeTags: [`chores`] })} />, async ({ root }) => {
    expect(must<HTMLSelectElement>(root, `[data-e2e="tag-filter"]`).value).toBe(`chores`)
  })
})

Deno.test("the Completed menu reports the range picked", async () => {
  const ranges: CompletedRange[] = []
  await mount(
    <ListScreen {...props({ onCompletedRangeChange: (range) => ranges.push(range) })} />,
    async ({ root, window, act }) => {
      const select = must<HTMLSelectElement>(root, `[data-e2e="completed-range"]`)
      await act(() => {
        select.value = CompletedRange.Week
        select.dispatchEvent(new window.Event(`change`, { bubbles: true }) as never)
      })
      expect(ranges).toEqual([CompletedRange.Week])
    },
  )
})

Deno.test("Completed shows today's, the last 7 or 30 days' or every finished task, newest first", () => {
  const done = (uid: string, title: string, stamp: string) =>
    makeTask(uid, title, {
      status: TaskStatus.Completed,
      ics: `BEGIN:VTODO\r\nUID:${uid}\r\nCOMPLETED:${stamp}\r\nEND:VTODO\r\n`,
    })
  const tasks = [
    done(`w`, `Six days ago`, `20261002T120000Z`),
    done(`t`, `This morning`, `20261008T070000Z`),
    done(`o`, `Seven days ago`, `20261001T235959Z`),
    makeTask(`x`, `Cancelled`, { status: TaskStatus.Cancelled }),
  ]
  const shown = (range: CompletedRange) => mount_titles(props({ tasks, completedRange: range }))
  expect(shown(CompletedRange.Today)).toEqual([`This morning`])
  expect(shown(CompletedRange.Week)).toEqual([`This morning`, `Six days ago`])
  expect(shown(CompletedRange.Month)).toEqual([`This morning`, `Six days ago`, `Seven days ago`])
  expect(shown(CompletedRange.All)).toEqual([
    `This morning`,
    `Six days ago`,
    `Seven days ago`,
    `Cancelled`,
  ])
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
      const [rename, del] = [...root.querySelectorAll<HTMLElement>(`[role="menuitem"]`)]
      expect(rename.className).not.toContain(`text-red`)
      expect(del.className).toContain(`text-red`)
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
  expect(tagged).toContain(`No open task has this tag`)
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

Deno.test("rows can be dragged in manual order only", async () => {
  const handles = (root: ParentNode) => root.querySelectorAll(`[data-sortable-handle]`).length
  await mount(
    <ListScreen {...props({ onReorder: () => {} })} />,
    async ({ root, rerender }) => {
      expect(handles(root)).toBe(4)
      await rerender(<ListScreen {...props({ onReorder: () => {}, sort: SortMode.Due })} />)
      expect(handles(root)).toBe(0)
      await rerender(<ListScreen {...props({ onReorder: () => {}, sort: SortMode.Title })} />)
      expect(handles(root)).toBe(0)
    },
  )
})

Deno.test("quick add on a list carries the app's wording, not the library's", async () => {
  await mount(<ListScreen {...props()} />, async ({ root, window, act }) => {
    const input = must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`)
    expect(input.getAttribute(`aria-label`)).toBe(`New task`)
    expect(input.placeholder).toBe(`Add a new task…`)
    expect(must(root, `[data-e2e="quick-add-submit"]`).textContent).toBe(`Add task`)
    input.value = `#work !high`
    await act(() => must<HTMLFormElement>(root, `[data-e2e="quick-add"]`).requestSubmit())
    expect(must(root, `[data-e2e="quick-add-live"]`).textContent).toContain(
      `Add a title to create the task`,
    )
    expect(focused(window)).toBe("input quick-add-input")
  })
})

Deno.test("quick add on a list reads the line in the viewer's zone", async () => {
  const dues: string[] = []
  for (const zone of [`Pacific/Kiritimati`, `Pacific/Pago_Pago`]) {
    await mount(
      <ListScreen
        {...props({ zone, onQuickAdd: (parsed) => dues.push(JSON.stringify(parsed.due)) })}
      />,
      async ({ root, act }) => {
        must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`).value = `Call mum today`
        await act(() => must<HTMLFormElement>(root, `[data-e2e="quick-add"]`).requestSubmit())
      },
    )
  }
  expect(dues).toHaveLength(2)
  expect(dues[0]).not.toBe(dues[1])
})

Deno.test("quick add on a list is held while a send is in flight", async () => {
  await mount(<ListScreen {...props({ quickAddBusy: true })} />, async ({ root }) => {
    expect(must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`).readOnly).toBe(true)
    expect(must<HTMLButtonElement>(root, `[data-e2e="quick-add-submit"]`).disabled).toBe(true)
  })
})
