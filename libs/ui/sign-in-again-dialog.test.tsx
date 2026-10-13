/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must } from "./mount.test.tsx"
import { SignInAgainDialog } from "./sign-in-again-dialog.tsx"

Deno.test("a closed sign-in-again dialog renders nothing", () => {
  expect(renderToString(<SignInAgainDialog open={false} onSignIn={() => {}} />)).toBe("")
})

Deno.test("the open dialog is named Sign in again, says the typed text is kept, and starts on the password", () => {
  const html = renderToString(<SignInAgainDialog open onSignIn={() => {}} />)
  expect(html).toMatch(/<dialog[^>]*data-e2e="sign-in-again-dialog"/)
  expect(html).toContain("Sign in again")
  const describedBy = /<dialog[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1]
  expect(html).toMatch(new RegExp(`<p id="${describedBy}">[^<]*what you typed is still here`))
  expect(html).toMatch(/<input[^>]*type="password"[^>]*autofocus/)
  // No way out but signing in: the header has no dismiss control.
  expect(html.match(/<button/g)).toHaveLength(1)
})

Deno.test("sending the dialog's form hands the password over, and a refusal is shown in it", async () => {
  const sent: string[] = []
  const onSignIn = (password: string) => void sent.push(password)
  await mount(<SignInAgainDialog open onSignIn={onSignIn} />, async ({ root, act, rerender }) => {
    const dialog = must(root, `[data-e2e="sign-in-again-dialog"]`)
    must<HTMLInputElement>(dialog, `[data-e2e="sign-in-password"]`).value = "owner password"
    await act(() => must<HTMLButtonElement>(dialog, `[data-e2e="sign-in-submit"]`).click())
    expect(sent).toEqual(["owner password"])

    await rerender(<SignInAgainDialog open onSignIn={onSignIn} error="Wrong password" />)
    expect(must(dialog, `[role="alert"]`).textContent).toBe("Wrong password")
  })
})
