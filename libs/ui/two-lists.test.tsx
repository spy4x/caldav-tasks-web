/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { clampShare, TwoLists } from "./two-lists.tsx"
import { mount, must } from "./mount.test.tsx"

Deno.test("the left list stays between a quarter and three quarters of the width", () => {
  expect([clampShare(10), clampShare(50.4), clampShare(90)]).toEqual([25, 50, 75])
  // On a 1000px page each list keeps 400px, so the left one stays between 40% and 60%.
  expect([clampShare(10, 1000), clampShare(90, 1000)]).toEqual([40, 60])
  expect(clampShare(30, 600)).toBe(50)
})

Deno.test("the switch asks for two lists, and the hinge's arrow keys resize them", async () => {
  const calls: unknown[] = []
  await mount(
    <TwoLists
      split
      onSplitChange={(split) => calls.push({ split })}
      share={73}
      onShareChange={(share) => calls.push({ share })}
      left={<p>left</p>}
      right={<p>right</p>}
    />,
    async ({ root, window, act }) => {
      expect(must(root, `[data-e2e="second-list"]`).textContent).toBe(`right`)
      const hinge = must<HTMLElement>(root, `[data-e2e="hinge"]`)
      expect(hinge.getAttribute(`aria-valuenow`)).toBe(`73`)
      await act(() => {
        for (const key of [`ArrowRight`, `ArrowLeft`]) {
          hinge.dispatchEvent(new window.KeyboardEvent(`keydown`, { key, bubbles: true }) as never)
        }
        must<HTMLButtonElement>(root, `#two-lists-switch`).click()
      })
      expect(calls).toEqual([{ share: 75 }, { share: 68 }, { split: false }])
    },
  )
})

Deno.test("a single list has no hinge and no second list", async () => {
  await mount(
    <TwoLists
      split={false}
      onSplitChange={() => {}}
      share={50}
      onShareChange={() => {}}
      left={<p>left</p>}
      right={<p>right</p>}
    />,
    ({ root }) => {
      expect(root.querySelector(`[data-e2e="hinge"]`)).toBeNull()
      expect(root.querySelector(`[data-e2e="second-list"]`)).toBeNull()
      const toggle = must<HTMLButtonElement>(root, `#two-lists-switch`)
      expect(toggle.getAttribute(`aria-labelledby`)).toBe(`two-lists-label`)
      expect(must(root, `#two-lists-label`).textContent).toBe(`2 lists`)
      return Promise.resolve()
    },
  )
})
