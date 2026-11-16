/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { mount, must, texts } from "./mount.test.tsx"
import { type NewTaskInput, Sidebar, type SidebarProps, splitParent } from "./sidebar.tsx"

Deno.test("splitParent cuts at the last spaced slash, and a slash inside a word stays in the title", () => {
  expect(splitParent(`Milk / Buy groceries`)).toEqual({ child: `Milk`, parent: `Buy groceries` })
  expect(splitParent(`Milk /`)).toEqual({ child: `Milk`, parent: `` })
  expect(splitParent(`A/B testing`)).toEqual({ child: `A/B testing` })
  expect(splitParent(`Milk`)).toEqual({ child: `Milk` })
})

const props = (over: Partial<SidebarProps> = {}): SidebarProps => ({
  links: [],
  newListHref: `/new-list`,
  settingsHref: `/settings`,
  parents: [{ uid: `g`, title: `Buy groceries` }, { uid: `w`, title: `Plan weekend` }],
  zone: `UTC`,
  onAdd: () => Promise.resolve(true),
  ...over,
})

Deno.test("typing ` /` offers the main tasks; picking one nests the task; an unknown name is created", async () => {
  const added: NewTaskInput[] = []
  await mount(
    <Sidebar {...props({ onAdd: (input) => (added.push(input), Promise.resolve(true)) })} />,
    async ({ root, window, act }) => {
      const field = must<HTMLTextAreaElement>(root, `[data-e2e="new-task-title"]`)
      const write = (value: string) =>
        act(() => {
          field.focus()
          field.value = value
          field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
        })
      const key = (k: string) =>
        act(async () => {
          field.dispatchEvent(
            new window.KeyboardEvent(`keydown`, { key: k, bubbles: true }) as never,
          )
          await new Promise((resolve) => setTimeout(resolve, 0))
        })

      await write(`Milk / gro`)
      expect(texts(root, `[data-e2e="new-task-parent-menu"] li`)).toEqual([
        `↳Buy groceries`,
        `+Create “gro” as a main task`,
      ])
      await key(`Enter`)
      expect(added[0]).toEqual({ text: `Milk`, priority: 0, parentUid: `g` })

      await write(`Eggs / Buy groceries`)
      await key(`Escape`)
      await key(`Enter`)
      expect(added[1]).toEqual({ text: `Eggs`, priority: 0, parentUid: `g` })

      await write(`Sun cream / Holiday`)
      await key(`Escape`)
      await key(`Enter`)
      expect(added[2]).toEqual({ text: `Sun cream`, priority: 0, parentTitle: `Holiday` })
    },
  )
})

Deno.test("the compact sidebar is the task field alone, and ` / ` still offers the main tasks", async () => {
  const added: NewTaskInput[] = []
  await mount(
    <Sidebar
      {...props({ onAdd: (input) => (added.push(input), Promise.resolve(true)) })}
      compact
    />,
    async ({ root, window, act }) => {
      expect(root.querySelector(`[data-e2e="new-task-due"]`)).toBeNull()
      expect(root.querySelector(`[data-e2e="new-task-priority"]`)).toBeNull()
      const field = must<HTMLTextAreaElement>(root, `[data-e2e="new-task-title"]`)
      expect(field.getAttribute(`aria-label`)).toBe(`New task`)
      await act(() => {
        field.focus()
        field.value = `Milk / gro`
        field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
      })
      expect(texts(root, `[data-e2e="new-task-parent-menu"] li`)).toEqual([
        `↳Buy groceries`,
        `+Create “gro” as a main task`,
      ])
      for (const _ of [1]) {
        await act(async () => {
          field.dispatchEvent(
            new window.KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }) as never,
          )
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
      }
      expect(added).toEqual([{ text: `Milk`, priority: 0, parentUid: `g` }])
    },
  )
})

Deno.test("Tab fills the picked main task in without adding; Enter then adds under it", async () => {
  const added: NewTaskInput[] = []
  await mount(
    <Sidebar {...props({ onAdd: (input) => (added.push(input), Promise.resolve(true)) })} />,
    async ({ root, window, act }) => {
      const field = must<HTMLTextAreaElement>(root, `[data-e2e="new-task-title"]`)
      const key = (k: string) =>
        act(async () => {
          field.dispatchEvent(
            new window.KeyboardEvent(`keydown`, { key: k, bubbles: true }) as never,
          )
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
      await act(() => {
        field.focus()
        field.value = `Milk / gro`
        field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
      })
      await key(`Tab`)
      expect(added).toEqual([])
      expect(field.value).toBe(`Milk`)
      await key(`Enter`)
      expect(added).toEqual([{ text: `Milk`, priority: 0, parentUid: `g` }])
    },
  )
})
