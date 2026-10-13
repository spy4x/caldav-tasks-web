/// <reference lib="deno.ns" />
import "fake-indexeddb/auto"
import { expect } from "@std/expect"
import { act } from "preact/test-utils"
import { memoryLocation } from "wouter-preact/memory-location"
import { Route, Router } from "wouter-preact"
import { AUTH_PATHS } from "@api/auth.ts"
import { LIST_HREF, task as fixture } from "@tasks/fixtures/tasksorg.ts"
import { must } from "@ui/mount.test.tsx"
import { onPage } from "./on-page.test.tsx"
import { SessionStatus, sessionStatus } from "../state/session.ts"
import { refresh } from "../state/sync.ts"
import { error, type FakeServer, withApp } from "../state/testing.ts"
import { ROUTES, taskPath } from "../routes.ts"
import { SignInAgainView } from "./SignInAgainView.tsx"
import { TaskEditorView } from "./TaskEditorView.tsx"

const HREF = `${LIST_HREF}one.ics`
const DIALOG = `[data-e2e="sign-in-again-dialog"]`

/** The editor with the dialog beside it, as the signed-in app draws them. */
function app() {
  const { hook } = memoryLocation({ path: taskPath({ uid: `1` }) })
  return (
    <Router hook={hook}>
      <Route path={ROUTES.task}>
        <TaskEditorView />
      </Route>
      <SignInAgainView />
    </Router>
  )
}

/** Clicks a control and lets the request behind it finish. */
async function press(root: ParentNode, name: string) {
  await act(async () => {
    must<HTMLElement>(root, `[data-e2e="${name}"]`).click()
    // `EnhancedForm` calls `onSubmit` one microtask after the submit event.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  for (let i = 0; i < 20; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 5)))
}

/**
 * A signed-in app whose server holds one task. `localStorage` is in memory meanwhile: signing in
 * records a hint there, and Deno's own storage would keep it on disk.
 */
async function signedIn(test: (server: FakeServer, stored: Map<string, string>) => Promise<void>) {
  const own = Object.getOwnPropertyDescriptor(globalThis, `localStorage`)
  const stored = new Map<string, string>()
  Object.defineProperty(globalThis, `localStorage`, {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  })
  try {
    await withApp(async (server) => {
      server.calendarList = [{ href: LIST_HREF, displayName: `Errands`, changeMarker: `c1` }]
      server.seed(HREF, LIST_HREF, fixture(`1`, `Buy milk`))
      await refresh()
      sessionStatus.value = SessionStatus.SignedIn
      await test(server, stored)
    })
  } finally {
    sessionStatus.value = SessionStatus.Unknown
    if (own) Object.defineProperty(globalThis, `localStorage`, own)
    else Reflect.deleteProperty(globalThis, `localStorage`)
  }
}

Deno.test(`a save refused for an ended session keeps the typed text, asks for the password over the editor, and saves after signing in`, async () => {
  await signedIn(async (server, stored) => {
    await onPage(app(), async ({ root }) => {
      expect(root.querySelector(DIALOG)).toBeNull()
      const title = must<HTMLInputElement>(root, `[data-e2e="task-title"]`)
      await act(() => {
        title.value = `Buy oat milk`
        title.dispatchEvent(
          new (title.ownerDocument.defaultView!.Event as typeof Event)(`input`, { bubbles: true }),
        )
      })
      // The session cookie has expired: the server refuses the save.
      server.next = error(401, `unauthorized`, `Sign in first`)
      await press(root, `task-save`)

      const dialog = must(root, DIALOG)
      // The same editor is still on the page, with what was typed.
      expect(must<HTMLInputElement>(root, `[data-e2e="task-title"]`)).toBe(title)
      expect(title.value).toBe(`Buy oat milk`)
      expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Buy milk`)

      must<HTMLInputElement>(dialog, `[data-e2e="sign-in-password"]`).value = `owner password`
      server.next = new Response(null, { status: 204 })
      await press(dialog, `sign-in-submit`)

      expect(server.sent.at(-1)).toMatchObject({ method: `POST`, path: AUTH_PATHS.signIn })
      expect(root.querySelector(DIALOG)).toBeNull()
      expect(title.value).toBe(`Buy oat milk`)
      await press(root, `task-save`)
      expect(server.objects.get(HREF)!.ics).toContain(`SUMMARY:Buy oat milk`)
      // Neither the typed text nor the password was put into browser storage.
      expect([...stored.values()].join()).not.toMatch(/oat milk|owner password/)
    })
  })
})

Deno.test(`a wrong password keeps the dialog open with the server's message`, async () => {
  await signedIn(async (server) => {
    await onPage(app(), async ({ root }) => {
      await act(() => {
        sessionStatus.value = SessionStatus.Expired
      })
      const dialog = must(root, DIALOG)
      must<HTMLInputElement>(dialog, `[data-e2e="sign-in-password"]`).value = `guess`
      server.next = error(401, `unauthorized`, `Wrong password`)
      await press(dialog, `sign-in-submit`)

      expect(must(root, `${DIALOG} [role="alert"]`).textContent).toBe(`Wrong password`)
      expect(sessionStatus.value).toBe(SessionStatus.Expired)
    })
  })
})
