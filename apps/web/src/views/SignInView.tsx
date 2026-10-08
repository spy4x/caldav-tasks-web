import { useSignal } from "@preact/signals"
import { SignInScreen } from "@ui/sign-in-screen.tsx"
import { signIn } from "../state/session.ts"

/** The sign-in screen wired to the session: shown by the app while the owner is signed out. */
export function SignInView() {
  const busy = useSignal(false)
  const error = useSignal<string | null>(null)
  return (
    <SignInScreen
      busy={busy.value}
      error={error.value}
      onSignIn={async (password) => {
        busy.value = true
        error.value = null
        error.value = await signIn(password)
        busy.value = false
      }}
    />
  )
}
