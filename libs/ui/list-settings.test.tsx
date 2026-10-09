/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { renderToString } from "preact-render-to-string"
import { LIST_HOLDS_EVENTS } from "@api/caldav.ts"
import {
  DEFAULT_LIST_COLOR,
  deleteQuestion,
  LIST_ADMIN_OFFLINE,
  type ListDraft,
  ListSettingsScreen,
  type ListSettingsScreenProps,
  pickerColor,
} from "./list-settings.tsx"

const SHOPPING = { href: `/cal/shopping/`, name: `Shopping`, color: `#E07A5FFF`, openCount: 9 }

function props(patch: Partial<ListSettingsScreenProps> = {}): ListSettingsScreenProps {
  return { onSave: () => {}, backHref: `/lists`, navigate: () => {}, ...patch }
}

/** Renders the screen into a fresh DOM, runs `test`, and cleans up whatever happens. */
async function mount(
  initial: ListSettingsScreenProps,
  test: (root: HTMLElement, window: Window) => Promise<void>,
): Promise<void> {
  const window = new Window({ url: `http://app.localhost/lists` })
  const own = { document: globalThis.document, FormData: globalThis.FormData }
  // `EnhancedForm` reads `new FormData(form)`, which Deno's own class refuses for a happy-dom form.
  Object.assign(globalThis, { document: window.document, FormData: window.FormData })
  const root = window.document.createElement(`div`) as unknown as HTMLElement
  window.document.body.append(root as never)
  try {
    await act(() => render(<ListSettingsScreen {...initial} />, root))
    await test(root, window)
  } finally {
    await act(() => render(null, root))
    Object.assign(globalThis, own)
    await window.happyDOM.close()
  }
}

const e2e = (root: ParentNode, name: string) =>
  root.querySelector(`[data-e2e="${name}"]`) as HTMLElement

/** Sets a control's value the way a person does, then fires `input`. */
async function type(root: ParentNode, name: string, value: string): Promise<void> {
  const input = e2e(root, name) as HTMLInputElement
  await act(() => {
    input.value = value
    input.dispatchEvent(
      new (input.ownerDocument.defaultView!.Event as typeof Event)(`input`, { bubbles: true }),
    )
  })
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    // `EnhancedForm` calls `onSubmit` one microtask after the submit event.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

Deno.test("a new list starts blank with the default colour and saves the trimmed name and the picked colour", async () => {
  const saved: ListDraft[] = []
  await mount(props({ onSave: (draft) => saved.push(draft) }), async (root) => {
    expect((e2e(root, `list-name`) as HTMLInputElement).value).toBe(``)
    expect((e2e(root, `list-color`) as HTMLInputElement).value).toBe(DEFAULT_LIST_COLOR)
    expect(e2e(root, `list-save`).textContent).toContain(`Create list`)
    await type(root, `list-name`, `  Groceries  `)
    await type(root, `list-color`, `#81B29A`)
    await press(e2e(root, `list-save`))
  })
  expect(saved).toEqual([{ name: `Groceries`, color: `#81b29a` }])
})

Deno.test("a blank name is refused with a message tied to the field, and nothing is saved", async () => {
  let saves = 0
  await mount(props({ onSave: () => saves++ }), async (root) => {
    await type(root, `list-name`, `   `)
    await press(e2e(root, `list-save`))
    const input = e2e(root, `list-name`)
    expect(input.getAttribute(`aria-invalid`)).toBe(`true`)
    const described = input.getAttribute(`aria-describedby`) ?? ``
    expect(described).not.toBe(``)
    expect(root.querySelector(`[id="${described.split(` `)[0]}"]`)?.textContent).toContain(
      `Enter a name`,
    )
  })
  expect(saves).toBe(0)
})

Deno.test("editing starts from the list's name and its Tasks.org colour without the alpha", async () => {
  const saved: ListDraft[] = []
  await mount(props({ list: SHOPPING, onSave: (draft) => saved.push(draft) }), async (root) => {
    expect((e2e(root, `list-name`) as HTMLInputElement).value).toBe(`Shopping`)
    expect((e2e(root, `list-color`) as HTMLInputElement).value).toBe(`#e07a5f`)
    expect(e2e(root, `list-save`).textContent).toContain(`Save`)
    await type(root, `list-name`, `Groceries`)
    await press(e2e(root, `list-save`))
  })
  expect(saved).toEqual([{ name: `Groceries`, color: `#e07a5f` }])
})

Deno.test("the picker takes #rrggbb from #RRGGBBAA or #RRGGBB, and the default for anything else", () => {
  expect(pickerColor(`#E07A5FFF`)).toBe(`#e07a5f`)
  expect(pickerColor(`#3D405B`)).toBe(`#3d405b`)
  expect(pickerColor(`rgb(1, 2, 3)`)).toBe(DEFAULT_LIST_COLOR)
  expect(pickerColor(`#abc`)).toBe(DEFAULT_LIST_COLOR)
  expect(pickerColor(undefined)).toBe(DEFAULT_LIST_COLOR)
})

Deno.test("Delete is in More actions, names the list and its task count, and only the confirmed Delete calls onDelete", async () => {
  let deleted = 0
  await mount(
    props({ list: SHOPPING, taskCount: 12, onDelete: () => deleted++ }),
    async (root, window) => {
      const more = e2e(root, `list-menu`)
      expect(more.getAttribute(`aria-label`) ?? more.textContent).toContain(`More actions`)
      await press(more)
      await press(e2e(root, `list-delete`))
      expect(deleted).toBe(0)
      const dialog = window.document.querySelector(`[data-e2e="list-delete-dialog"]`)!
      expect(dialog.textContent).toContain(`Delete Shopping and its 12 tasks?`)
      await press(
        [...dialog.querySelectorAll(`button`)].find((b) => b.textContent === `Keep it`) as never,
      )
      expect(deleted).toBe(0)
      expect(window.document.querySelector(`[data-e2e="list-delete-dialog"]`) === null).toBe(true)

      await press(more)
      await press(e2e(root, `list-delete`))
      const again = window.document.querySelector(`[data-e2e="list-delete-dialog"]`)!
      await press(
        [...again.querySelectorAll(`button`)].find((b) => b.textContent === `Delete`) as never,
      )
      expect(deleted).toBe(1)
    },
  )
})

Deno.test("the delete question counts one task, many tasks, or none, and names no number when unknown", () => {
  expect(deleteQuestion(`Shopping`, null)).toBe(`Delete Shopping and all its tasks?`)
  expect(deleteQuestion(`Shopping`, 0)).toBe(`Delete Shopping?`)
  expect(deleteQuestion(`Shopping`, 1)).toBe(`Delete Shopping and its 1 task?`)
  expect(deleteQuestion(`Shopping`, 12)).toBe(`Delete Shopping and its 12 tasks?`)
})

Deno.test("a new list has no More actions menu", () => {
  const html = renderToString(<ListSettingsScreen {...props({ onDelete: () => {} })} />)
  expect(html).not.toContain(`data-e2e="list-menu"`)
  expect(html).toMatch(/<h1[^>]*>.*New list.*<\/h1>/)
})

Deno.test("offline, the screen says so, Save and Delete are disabled, and a submit saves nothing", async () => {
  let saves = 0
  await mount(
    props({ list: SHOPPING, offline: true, onSave: () => saves++, onDelete: () => {} }),
    async (root) => {
      expect(e2e(root, `list-offline`).textContent).toContain(LIST_ADMIN_OFFLINE)
      expect((e2e(root, `list-save`) as HTMLButtonElement).disabled).toBe(true)
      await press(e2e(root, `list-menu`))
      expect((e2e(root, `list-delete`) as HTMLButtonElement).disabled).toBe(true)
      // Enter in the name submits the form even with Save disabled.
      const form = root.querySelector(`form`)!
      await act(async () => {
        form.requestSubmit()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
  )
  expect(saves).toBe(0)
})

Deno.test("a failed save or delete shows its message as an alert", () => {
  const html = renderToString(
    <ListSettingsScreen {...props({ list: SHOPPING, error: `The CalDAV server failed` })} />,
  )
  expect(html).toMatch(/role="alert"[^>]*>The CalDAV server failed</)
})

Deno.test("while the task count is loading, Delete is disabled", async () => {
  await mount(
    props({ list: SHOPPING, taskCount: 1, counting: true, onDelete: () => {} }),
    async (root) => {
      await press(e2e(root, `list-menu`))
      expect((e2e(root, `list-delete`) as HTMLButtonElement).disabled).toBe(true)
    },
  )
})

Deno.test("a list that may hold events has no Delete and says to delete it in a calendar app", () => {
  const html = renderToString(
    <ListSettingsScreen {...props({ list: SHOPPING, holdsEvents: true, onDelete: () => {} })} />,
  )
  expect(html).not.toContain(`data-e2e="list-menu"`)
  expect(html).toContain(LIST_HOLDS_EVENTS)
})
