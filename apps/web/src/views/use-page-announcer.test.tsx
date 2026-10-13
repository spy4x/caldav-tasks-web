/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useEffect, useRef } from "preact/hooks"
import { focused } from "@ui/mount.test.tsx"
import { onPage } from "./on-page.test.tsx"
import { usePageAnnouncer } from "./use-page-announcer.ts"

/** A page whose search field takes the focus as it opens, the way `/` opens Search. */
function SearchPage() {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])
  return (
    <>
      <h1>Search</h1>
      <input ref={field} data-e2e="search-input" />
    </>
  )
}

function Site({ path }: { path: string }) {
  usePageAnnouncer({ path, title: `${path} · Tasks` })
  return (
    <>
      <a href="/lists" data-e2e="nav">Lists</a>
      <main>
        {path === `/search` ? <SearchPage /> : <h1 data-e2e={`heading ${path}`}>{path}</h1>}
      </main>
    </>
  )
}

Deno.test(`a page change names the new page in the tab title and moves focus from the link to its heading`, async () => {
  await onPage(<Site path="/" />, async ({ root, window, rerender }) => {
    expect(window.document.title).toBe(`/ · Tasks`)
    root.querySelector<HTMLElement>(`[data-e2e="nav"]`)?.focus()
    await rerender(<Site path="/lists" />)
    expect(window.document.title).toBe(`/lists · Tasks`)
    expect(focused(window)).toBe(`h1 heading /lists`)
  })
})

Deno.test(`a page that opens with the focus in its own field keeps it there`, async () => {
  await onPage(<Site path="/" />, async ({ root, window, rerender }) => {
    root.querySelector<HTMLElement>(`[data-e2e="nav"]`)?.focus()
    await rerender(<Site path="/search" />)
    expect(window.document.title).toBe(`/search · Tasks`)
    expect(focused(window)).toBe(`input search-input`)
  })
})
