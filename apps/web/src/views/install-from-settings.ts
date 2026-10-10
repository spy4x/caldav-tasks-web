import type { InstallPromptStore } from "@spy4x/preact-signals/install-prompt"
import { toasts } from "../state/toasts.ts"
import { focusMain } from "./focus-main.ts"

/**
 * Settings' Install button: opens the browser's install dialog. A browser that refuses it (no user
 * gesture, a dialog already open) shows a message instead of an unhandled error. The row leaves
 * once the dialog is used up, so focus then goes to the page, not the body.
 */
export async function installFromSettings(
  store: InstallPromptStore,
  focus: () => unknown = focusMain,
): Promise<void> {
  try {
    await store.install()
  } catch (_refused) {
    toasts.error({
      title: ``,
      body: `The browser did not open its install dialog. Try again, or use its menu.`,
    })
  }
  if (store.mode.value !== `prompt`) focus()
}
