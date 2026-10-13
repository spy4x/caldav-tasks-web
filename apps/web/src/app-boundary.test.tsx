/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { onPage } from "./views/on-page.test.tsx"
import { AppBoundary } from "./app-boundary.tsx"

function Broken(): never {
  throw new Error(`render failed`)
}

Deno.test(`a component that throws while it renders leaves a reload screen, not a blank page`, async () => {
  const ownError = console.error
  const reported: unknown[] = []
  console.error = (...args: unknown[]) => reported.push(args[0])
  try {
    await onPage(
      <AppBoundary>
        <Broken />
      </AppBoundary>,
      ({ root }) => {
        const screen = root.querySelector(`[data-e2e="app-error"]`)
        expect(screen?.getAttribute(`role`)).toBe(`alert`)
        expect(screen?.querySelector(`h1`)?.textContent).toBe(`Something went wrong.`)
        expect(root.querySelector(`[data-e2e="app-error-reload"]`)?.textContent).toBe(
          `Reload the page`,
        )
        return Promise.resolve()
      },
    )
  } finally {
    console.error = ownError
  }
  expect(reported.map((error) => (error as Error).message)).toEqual([`render failed`])
})
