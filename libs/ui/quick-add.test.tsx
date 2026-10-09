/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { focused, mount, must } from "./mount.test.tsx"
import { QuickAdd } from "./quick-add.tsx"

const input = (root: ParentNode) => must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`)
const form = (root: ParentNode) => must<HTMLFormElement>(root, `[data-e2e="quick-add"]`)

Deno.test("the field has an accessible name and the button is named Add task", () => {
  const html = renderToString(<QuickAdd onAdd={() => {}} />)
  expect(html).toContain(`aria-label="New task"`)
  expect(html).toMatch(/<span class="sr-only">Add task<\/span>/)
})

Deno.test("typing a title and sending it adds the trimmed title, empties the field and keeps focus", async () => {
  const added: string[] = []
  await mount(<QuickAdd onAdd={(title) => added.push(title)} />, async ({ root, window, act }) => {
    input(root).focus()
    input(root).value = `  Buy oat milk  `
    input(root).blur()
    await act(() => form(root).requestSubmit())
    expect(added).toEqual([`Buy oat milk`])
    expect(input(root).value).toBe(``)
    expect(focused(window)).toBe(`input quick-add-input`)
  })
})

Deno.test("a blank title adds nothing and leaves what was typed", async () => {
  const added: string[] = []
  await mount(<QuickAdd onAdd={(title) => added.push(title)} />, async ({ root, act }) => {
    input(root).value = `   `
    await act(() => form(root).requestSubmit())
    expect(added).toEqual([])
    expect(input(root).value).toBe(`   `)
  })
})

Deno.test("while a task is being created a send adds nothing and the typed title stays", async () => {
  const added: string[] = []
  await mount(
    <QuickAdd onAdd={(title) => added.push(title)} busy />,
    async ({ root, act }) => {
      input(root).value = `Second`
      await act(() => form(root).requestSubmit())
      expect(added).toEqual([])
      expect(input(root).value).toBe(`Second`)
      expect(must<HTMLButtonElement>(root, `[data-e2e="quick-add-submit"]`).disabled).toBe(true)
    },
  )
})

Deno.test("the hint says where the task goes and the field points at it", () => {
  const html = renderToString(<QuickAdd onAdd={() => {}} hint="Added to Errands" />)
  expect(html).toContain(`Added to Errands`)
  const id = html.match(/aria-describedby="([^"]+)"/)?.[1]
  expect(id).toBeTruthy()
  expect(html).toContain(`id="${id}"`)
})

Deno.test("two quick adds on a page point at their own hints", () => {
  const html = renderToString(
    <div>
      <QuickAdd onAdd={() => {}} hint="One" />
      <QuickAdd onAdd={() => {}} hint="Two" />
    </div>,
  )
  const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1])
  expect(ids).toHaveLength(2)
  expect(ids[0]).not.toBe(ids[1])
})
