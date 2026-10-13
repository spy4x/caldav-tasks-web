/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { memoryLocation } from "wouter-preact/memory-location"
import { Route, Router } from "wouter-preact"
import { onPage } from "./on-page.test.tsx"
import { withApp } from "../state/testing.ts"
import { ROUTES } from "../routes.ts"
import { ListView } from "./ListView.tsx"

Deno.test(`a list page says it is loading while the lists are not known yet`, async () => {
  await withApp(async () => {
    const { hook } = memoryLocation({ path: `/lists/errands` })
    await onPage(
      <Router hook={hook}>
        <Route path={ROUTES.list}>
          <ListView />
        </Route>
      </Router>,
      ({ root }) => {
        const status = root.querySelector(`[role="status"]`)
        expect(status?.textContent).toBe(`Loading list`)
        return Promise.resolve()
      },
    )
  })
})
