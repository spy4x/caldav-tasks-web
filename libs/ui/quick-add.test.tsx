/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type { Window } from "happy-dom"
import { renderToString } from "preact-render-to-string"
import { QuickAddPriority, type QuickAddResult } from "@spy4x/platform"
import { focused, mount, must } from "./mount.test.tsx"
import { QuickAdd } from "./quick-add.tsx"

const input = (root: ParentNode) => must<HTMLInputElement>(root, `[data-e2e="quick-add-input"]`)
const ZONE = `Asia/Ho_Chi_Minh`
// 01:00 on Sunday 11 October 2026 in Ho Chi Minh (UTC+7), still Saturday the 10th in UTC.
const NOW = () => new Date(`2026-10-10T18:00:00Z`)
const add = (onAdd: (parsed: QuickAddResult) => void = () => {}) => (
  <QuickAdd onAdd={onAdd} zone={ZONE} now={NOW} />
)
const type = (window: Window, root: ParentNode, text: string) => {
  input(root).value = text
  input(root).dispatchEvent(new window.Event(`input`, { bubbles: true }) as never)
}
const chips = (root: ParentNode) =>
  [...root.querySelectorAll(`[data-e2e="quick-add-chips"] li`)].map((li) => li.textContent)
const live = (root: ParentNode) => must(root, `[data-e2e="quick-add-live"]`).textContent

const form = (root: ParentNode) => must<HTMLFormElement>(root, `[data-e2e="quick-add"]`)

Deno.test("the field has an accessible name and the button is named Add task", () => {
  const html = renderToString(add())
  expect(html).toContain(`aria-label="New task"`)
  expect(html).toMatch(/<span class="sr-only">Add task<\/span>/)
})

Deno.test("typing a title and sending it adds the trimmed title, empties the field and keeps focus", async () => {
  const added: string[] = []
  await mount(add((parsed) => added.push(parsed.title)), async ({ root, window, act }) => {
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
  await mount(add((parsed) => added.push(parsed.title)), async ({ root, act }) => {
    input(root).value = `   `
    await act(() => form(root).requestSubmit())
    expect(added).toEqual([])
    expect(input(root).value).toBe(`   `)
  })
})

Deno.test("while a task is being created a send adds nothing and the typed title stays", async () => {
  const added: string[] = []
  await mount(
    <QuickAdd onAdd={(parsed) => added.push(parsed.title)} zone={ZONE} busy />,
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
  const html = renderToString(<QuickAdd onAdd={() => {}} zone={ZONE} hint="Added to Errands" />)
  expect(html).toContain(`Added to Errands`)
  const id = html.match(/aria-describedby="([^"]+)"/)?.[1]
  expect(id).toBeTruthy()
  expect(html).toContain(`id="${id}"`)
})

Deno.test("two quick adds on a page point at their own hints", () => {
  const html = renderToString(
    <div>
      <QuickAdd onAdd={() => {}} zone={ZONE} hint="One" />
      <QuickAdd onAdd={() => {}} zone={ZONE} hint="Two" />
    </div>,
  )
  const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1])
  expect(ids).toHaveLength(2)
  expect(ids[0]).not.toBe(ids[1])
})

Deno.test("typing tokens shows each recognised part as a chip and reads them out politely", async () => {
  await mount(add(), async ({ root, window, act }) => {
    await act(() => type(window, root, `Call Anna #work tomorrow 3pm !high`))
    expect(chips(root)).toEqual([`Tag work`, `Due Tomorrow 15:00`, `High priority`])
    expect(live(root)).toBe(`Tag work, Due Tomorrow 15:00, High priority`)
    const region = must(root, `[data-e2e="quick-add-live"]`)
    expect(region.getAttribute(`aria-live`)).toBe(`polite`)
    expect(region.getAttribute(`role`)).toBe(`status`)
  })
})

Deno.test("a plain title shows no chips and the live region stays empty but present", async () => {
  await mount(add(), async ({ root, window, act }) => {
    await act(() => type(window, root, `Buy oat milk`))
    expect(chips(root)).toEqual([])
    expect(live(root)).toBe(``)
  })
})

Deno.test("sending a line with tokens passes the title, tag, due and priority parsed in the zone", async () => {
  const added: QuickAddResult[] = []
  await mount(add((parsed) => added.push(parsed)), async ({ root, window, act }) => {
    await act(() => type(window, root, `Call Anna #work tomorrow 3pm !high`))
    await act(() => form(root).requestSubmit())
    expect(added).toHaveLength(1)
    expect(added[0].title).toBe(`Call Anna`)
    expect(added[0].tags).toEqual([`work`])
    expect(added[0].due).toEqual({ date: `2026-10-12`, time: `15:00` })
    expect(added[0].priority).toBe(QuickAddPriority.High)
    expect(chips(root)).toEqual([])
    expect(input(root).value).toBe(``)
  })
})

Deno.test("a line of only tokens adds nothing and keeps what was typed", async () => {
  const added: QuickAddResult[] = []
  await mount(add((parsed) => added.push(parsed)), async ({ root, window, act }) => {
    await act(() => type(window, root, `#work !high`))
    await act(() => form(root).requestSubmit())
    expect(added).toEqual([])
    expect(input(root).value).toBe(`#work !high`)
  })
})
