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
  expect(html).toContain(`aria-describedby="quick-add-hint"`)
  expect(html).toContain(`id="quick-add-hint"`)
})
