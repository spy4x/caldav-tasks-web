import type { JSX } from "preact"
import { Modal } from "@spy4x/preact-ui/modal"
import { SignInForm, type SignInScreenProps } from "./sign-in-screen.tsx"

/** Props of {@link SignInAgainDialog}. */
export interface SignInAgainDialogProps extends SignInScreenProps {
  /** Whether the dialog is on screen: the session ended while the app was open. */
  open: boolean
}

const MESSAGE_ID = "sign-in-again-message"

/**
 * "Sign in again": shown over the app when the session ended while it was open. The page under it
 * stays as it was, so a task being edited keeps what was typed. Escape and the backdrop do nothing:
 * without a session nothing can be saved, and the only other way out, a reload, drops the text.
 */
export function SignInAgainDialog(
  { open, ...form }: SignInAgainDialogProps,
): JSX.Element | null {
  if (!open) return null
  return (
    <Modal
      open
      title="Sign in again"
      ariaDescribedBy={MESSAGE_ID}
      closeOnBackdrop={false}
      onClose={() => false}
      dataE2E="sign-in-again-dialog"
    >
      <SignInForm {...form} autofocus>
        <p id={MESSAGE_ID}>
          Your session has ended. Sign in to carry on: what you typed is still here, and nothing is
          saved until you do.
        </p>
      </SignInForm>
    </Modal>
  )
}
