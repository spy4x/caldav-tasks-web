import type { JSX } from "preact"
import { Button } from "@spy4x/preact-ui/button"
import { Modal } from "@spy4x/preact-ui/modal"

/** Props of {@link ConflictDialog}. */
export interface ConflictDialogProps {
  /** Whether the dialog is on screen: a save collided with an edit made elsewhere. */
  open: boolean
  /** Save what is in the editor over the other device's version. */
  onKeepMine: () => void
  /** Drop what is in the editor and load the other device's version. */
  onUseTheirs: () => void
  /** One of the two choices is being carried out: both buttons are disabled. */
  busy?: boolean
}

const MESSAGE_ID = "task-conflict-message"

/**
 * "Changed on another device": shown when a save found the task edited elsewhere. It has no way
 * out but the two choices, so Escape and the backdrop do nothing: closing it would leave the
 * editor holding a version the server has already refused. The focus starts on "Use theirs", the
 * choice that loses nothing the server holds.
 */
export function ConflictDialog(
  { open, onKeepMine, onUseTheirs, busy = false }: ConflictDialogProps,
): JSX.Element | null {
  if (!open) return null
  return (
    <Modal
      open
      role="alertdialog"
      title="Changed on another device"
      ariaDescribedBy={MESSAGE_ID}
      closeOnBackdrop={false}
      onClose={() => false}
      dataE2E="task-conflict-dialog"
      footer={
        <>
          <Button
            variant="outline"
            disabled={busy}
            onClick={onUseTheirs}
            autofocus
            data-e2e="task-conflict-use-theirs"
          >
            Use theirs
          </Button>
          <Button disabled={busy} onClick={onKeepMine} data-e2e="task-conflict-keep-mine">
            Keep mine
          </Button>
        </>
      }
    >
      <p id={MESSAGE_ID}>
        Someone changed this task on another device while you were editing it. "Keep mine" saves
        your version over theirs. "Use theirs" drops what you typed here and loads theirs.
      </p>
    </Modal>
  )
}
