/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { render } from "preact"
import { act } from "preact/test-utils"
import { must } from "@ui/mount.test.tsx"
import { onPage } from "./on-page.test.tsx"
import { SearchView } from "./SearchView.tsx"

Deno.test("a letter typed before the search page has read its address stays in the field", async () => {
  await onPage(null, async ({ root, window }) => {
    // Drawn without `act`, so the page's effects wait, as in a browser busy loading the app.
    render(<SearchView />, root)
    const field = must<HTMLInputElement>(root, `[data-e2e="search-input"]`)
    field.value = `h`
    field.dispatchEvent(new window.Event(`input`, { bubbles: true }) as unknown as Event)
    await act(() => new Promise<void>((done) => setTimeout(done, 10)))
    expect(field.value).toBe(`h`)
  })
})
