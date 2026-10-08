import type { JSX } from "preact"
import { useEffect, useRef } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody } from "@spy4x/preact-ui/card"
import { Field } from "@spy4x/preact-ui/field"
import { Input } from "@spy4x/preact-ui/input"

/** Props of {@link SignInScreen}. */
export interface SignInScreenProps {
  /** Called with the typed password when the form is sent. Never called while `busy`. */
  onSignIn: (password: string) => void
  /** A sign-in request is running: the button is disabled and the wait is announced. */
  busy?: boolean
  /**
   * Why the last attempt failed, such as a wrong password or a lockout that says when to try again.
   * Clear it when a new attempt starts, so the same message is announced again if it comes back.
   */
  error?: string | null
}

const PASSWORD_ID = "sign-in-password"
const ERROR_ID = "sign-in-error"

/**
 * The sign-in screen: one password field and "Sign in", centred on the page. The app has one
 * owner, so there is no user name.
 *
 * The password is read from the field when the form is sent, never kept in state. The error sits in a
 * live region that is always in the page, so a screen reader announces each new message. When an
 * attempt fails, the focus returns to the password field, which is marked invalid and described by
 * the message, and its text is selected, so the owner hears why and can type again at once.
 */
export function SignInScreen({ onSignIn, busy = false, error }: SignInScreenProps): JSX.Element {
  const password = useRef<HTMLInputElement>(null)
  const message = error || null

  useEffect(() => {
    if (busy || !message) return
    password.current?.focus()
    password.current?.select()
  }, [busy, message])

  const submit = (event: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    if (busy) return
    onSignIn(password.current?.value ?? "")
  }

  return (
    <main class="grid min-h-dvh place-items-center p-4">
      <Card class="w-full max-w-sm">
        <CardBody>
          {/* `method="post"`: a send before the script runs never puts the password in the URL. */}
          <form method="post" onSubmit={submit} class="space-y-4" data-e2e="sign-in-form">
            <h1 class="text-2xl font-semibold">Sign in</h1>
            <Field id={PASSWORD_ID} label="Password" required>
              {(wiring) => (
                <Input
                  ref={password}
                  id={wiring.id}
                  name="password"
                  type="password"
                  autocomplete="current-password"
                  required
                  aria-invalid={message ? true : undefined}
                  aria-describedby={message ? ERROR_ID : undefined}
                  data-e2e="sign-in-password"
                />
              )}
            </Field>
            <div role="alert" aria-live="assertive" aria-atomic="true">
              {message && (
                <p id={ERROR_ID} class="text-sm text-danger" data-e2e="sign-in-error">
                  {message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={busy} class="w-full" data-e2e="sign-in-submit">
              Sign in
            </Button>
            <p role="status" aria-live="polite" aria-atomic="true" class="sr-only">
              {busy ? "Signing in…" : ""}
            </p>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}
