import { useSignal } from "@preact/signals"
import { SignInAgainDialog } from "@ui/sign-in-again-dialog.tsx"
import { SessionStatus, sessionStatus, signIn } from "../state/session.ts"

/**
 * Asks for the password over the app once the session has ended, and nowhere else. The page under
 * it is not redrawn, so an open editor keeps its text; after signing in the person saves again.
 */
export function SignInAgainView() {
  const busy = useSignal(false)
  const error = useSignal<string | null>(null)
  return (
    <SignInAgainDialog
      open={sessionStatus.value === SessionStatus.Expired}
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
