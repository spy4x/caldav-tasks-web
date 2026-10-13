/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useEffect, useRef } from "preact/hooks"
import { focused } from "@ui/mount.test.tsx"
import { useRouteAnnouncer } from "@spy4x/preact-system/route-announcer"
import { onPage } from "./views/on-page.test.tsx"

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

/** The library's announcer, called the way the signed-in app calls it. */
function Site({ path }: { path: string }) {
  useRouteAnnouncer({ path, title: `${path} · Tasks`, keepPageFocus: true })
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
