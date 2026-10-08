/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { renderToString } from "preact-render-to-string"
import { SignInScreen, type SignInScreenProps } from "./sign-in-screen.tsx"

/** Renders the screen into a fresh DOM and hands the test a way to re-render it with new props. */
async function mount(
  test: (
    root: HTMLElement,
    window: Window,
    rerender: (props: SignInScreenProps) => Promise<void>,
  ) => Promise<void>,
  props: SignInScreenProps,
): Promise<void> {
  const window = new Window({ url: "http://app.localhost/" })
  const own = globalThis.document
  Object.assign(globalThis, { document: window.document })
  const root = window.document.createElement("div") as unknown as HTMLElement
  window.document.body.append(root as never)
  const rerender = (next: SignInScreenProps) => act(() => render(<SignInScreen {...next} />, root))
  try {
    await rerender(props)
    await test(root, window, rerender)
  } finally {
    await act(() => render(null, root))
    Object.assign(globalThis, { document: own })
    await window.happyDOM.close()
  }
}

Deno.test("the screen has a heading, a labelled password field, an empty alert region and Sign in", () => {
  const html = renderToString(<SignInScreen onSignIn={() => {}} />)
  expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/)
  expect(html).toMatch(/<label[^>]*for="sign-in-password"[^>]*>[\s\S]*Password/)
  expect(html).toMatch(/<input[^>]*type="password"/)
  expect(html).toContain(`autocomplete="current-password"`)
  expect(html).toMatch(/<div role="alert" aria-live="assertive" aria-atomic="true"><\/div>/)
  expect(html).toContain(`method="post"`)
})

Deno.test("typing and submitting hands the password over, and a failure moves focus back to it with the error", async () => {
  const sent: string[] = []
  const onSignIn = (password: string) => sent.push(password)
  await mount(async (root, window, rerender) => {
    const input = root.querySelector(`[data-e2e="sign-in-password"]`) as HTMLInputElement
    const button = root.querySelector(`[data-e2e="sign-in-submit"]`) as HTMLButtonElement
    input.value = "my password"
    await act(() => {
      button.click()
    })
    expect(sent).toEqual(["my password"])

    // The caller is waiting for the server: the button is disabled and the wait is announced.
    await rerender({ onSignIn, busy: true })
    expect(button.disabled).toBe(true)
    expect(root.querySelector(`[role="status"]`)?.textContent).toBe("Signing in…")
    button.focus()

    await rerender({ onSignIn, busy: false, error: "Wrong password" })
    const alert = root.querySelector(`[role="alert"]`)!
    expect(alert.textContent).toBe("Wrong password")
    expect(window.document.activeElement?.id).toBe(input.id)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    const describedBy = input.getAttribute("aria-describedby")!
    expect(window.document.getElementById(describedBy)?.textContent).toBe("Wrong password")
  }, { onSignIn })
})

Deno.test("a submit while busy calls nothing", async () => {
  const sent: string[] = []
  await mount(async (root) => {
    const input = root.querySelector(`[data-e2e="sign-in-password"]`) as HTMLInputElement
    const form = root.querySelector(`[data-e2e="sign-in-form"]`) as HTMLFormElement
    input.value = "again"
    await act(() => {
      form.requestSubmit()
    })
    expect(sent).toEqual([])
  }, { onSignIn: (password) => sent.push(password), busy: true })
})

Deno.test("a lockout message is shown as given, so it says when to try again", () => {
  const message = "Too many wrong passwords. Try again in 15 minutes."
  const html = renderToString(<SignInScreen onSignIn={() => {}} error={message} />)
  expect(html).toContain(message)
  expect(html).toContain(`aria-invalid="true"`)
})
