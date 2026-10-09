/// <reference lib="deno.ns" />
// A helper for the interaction tests, not a test file. It carries the `.test.tsx` suffix so the
// screen-contract guard skips it: it must name the page's `document` to give the screens one.
import { Window } from "happy-dom"
import { type ComponentChildren, render } from "preact"
import { act } from "preact/test-utils"

/** What a test gets to work with. */
export interface Mounted {
  root: HTMLElement
  window: Window
  /** Draws `next` into the same root, as a parent re-rendering with new props. */
  rerender: (next: ComponentChildren) => Promise<void>
  /** Runs `action` the way the browser would, then lets the screen settle. */
  act: (action: () => void) => Promise<void>
}

/** Renders `ui` into a fresh happy-dom page, runs `test`, and cleans up whatever happens. */
export async function mount(
  ui: ComponentChildren,
  test: (mounted: Mounted) => Promise<void>,
): Promise<void> {
  const window = new Window({ url: `http://app.localhost/` })
  const own = globalThis.document
  Object.assign(globalThis, { document: window.document })
  const root = window.document.createElement(`div`) as unknown as HTMLElement
  window.document.body.append(root as never)
  const rerender = (next: ComponentChildren) => act(() => render(next, root))
  try {
    await rerender(ui)
    await test({
      root,
      window,
      rerender,
      act: (action) =>
        act(() => {
          action()
        }),
    })
  } finally {
    await act(() => render(null, root))
    Object.assign(globalThis, { document: own })
    await window.happyDOM.close()
  }
}

/** The element a selector finds, or a failure that names the selector. */
export function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector(selector)
  if (!found) throw new Error(`Nothing matches ${selector}`)
  return found as T
}

/** The text of every element a selector finds, in document order. */
export function texts(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((element) => element.textContent?.trim() ?? ``)
}
