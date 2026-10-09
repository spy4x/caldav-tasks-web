/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type { Window } from "happy-dom"
import { renderToString } from "preact-render-to-string"
import { QuickAddPriority, type QuickAddResult } from "@spy4x/platform"
import { act } from "preact/test-utils"
import { focused, mount, must } from "./mount.test.tsx"
import { ANNOUNCE_PAUSE_MS, QuickAdd } from "./quick-add.tsx"

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

/** Replaces `setTimeout` with a clock the test moves by hand, and puts the real one back after. */
async function withFakeTimers(
  test: (clock: { advance: (ms: number) => Promise<void> }) => Promise<void>,
): Promise<void> {
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout }
  let nowMs = 0
  let nextId = 1
  const pending = new Map<number, { at: number; run: () => void }>()
  globalThis.setTimeout = ((run: () => void, ms = 0) => {
    const id = nextId++
    pending.set(id, { at: nowMs + ms, run })
    return id
  }) as never
  globalThis.clearTimeout = ((id: number) => void pending.delete(id)) as never
  try {
    await test({
      advance: async (ms) => {
        nowMs += ms
        for (const [id, timer] of [...pending]) {
          if (timer.at <= nowMs) {
            pending.delete(id)
            await act(() => timer.run())
          }
        }
      },
    })
  } finally {
    globalThis.setTimeout = real.set
    globalThis.clearTimeout = real.clear
  }
}

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

Deno.test("typing tokens shows each recognised part as a chip at once and reads them out politely", async () => {
  await withFakeTimers(async (clock) => {
    await mount(add(), async ({ root, window, act }) => {
      await act(() => type(window, root, `Call Anna #work tomorrow 3pm !high`))
      expect(chips(root)).toEqual([`Tag work`, `Due Tomorrow 15:00`, `High priority`])
      await clock.advance(ANNOUNCE_PAUSE_MS)
      expect(live(root)).toBe(`Tag work, Due Tomorrow 15:00, High priority`)
      const region = must(root, `[data-e2e="quick-add-live"]`)
      expect(region.getAttribute(`aria-live`)).toBe(`polite`)
      expect(region.getAttribute(`role`)).toBe(`status`)
    })
  })
})

Deno.test("typing a tag letter by letter changes the chips each time but is announced once, after a pause", async () => {
  await withFakeTimers(async (clock) => {
    await mount(add(), async ({ root, window, act }) => {
      for (const line of [`a #w`, `a #wo`, `a #wor`, `a #work`]) {
        await act(() => type(window, root, line))
        await clock.advance(ANNOUNCE_PAUSE_MS - 100)
        expect(live(root)).toBe(``)
      }
      expect(chips(root)).toEqual([`Tag work`])
      await clock.advance(100)
      expect(live(root)).toBe(`Tag work`)
    })
  })
})

Deno.test("a send with only tokens says why nothing was added, and typing again clears it", async () => {
  await mount(add(), async ({ root, window, act }) => {
    await act(() => type(window, root, `#work !high`))
    await act(() => form(root).requestSubmit())
    expect(live(root)).toBe(`Add a title to create the task`)
    await act(() => type(window, root, `#work !high x`))
    expect(live(root)).toBe(``)
  })
})

Deno.test("a hint given as a function follows the parsed line", async () => {
  const hint = (parsed: QuickAddResult) => parsed.due ? `dated` : `undated`
  await mount(<QuickAdd onAdd={() => {}} zone={ZONE} now={NOW} hint={hint} />, async (m) => {
    expect(m.root.textContent).toContain(`undated`)
    await m.act(() => type(m.window, m.root, `x tomorrow`))
    expect(m.root.textContent).toContain(`dated`)
    expect(m.root.textContent).not.toContain(`undated`)
  })
})

Deno.test("on the spring-forward day the chip shows the time that is saved, not the shifted hour", async () => {
  const added: QuickAddResult[] = []
  const berlin = () => new Date(`2027-03-27T12:00:00Z`)
  await mount(
    <QuickAdd onAdd={(parsed) => added.push(parsed)} zone="Europe/Berlin" now={berlin} />,
    async ({ root, window, act }) => {
      await act(() => type(window, root, `Call tomorrow 2:30am`))
      expect(chips(root)).toEqual([`Due Tomorrow 02:30`])
      await act(() => form(root).requestSubmit())
      expect(added[0].due).toEqual({ date: `2027-03-28`, time: `02:30` })
    },
  )
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
