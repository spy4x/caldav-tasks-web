import type { InstallPromptStore } from "@spy4x/preact-signals/install-prompt"
import { InstallPrompt } from "@spy4x/preact-system/install-prompt"
import { focusMain } from "./focus-main.ts"
import { install } from "../state/install.ts"

/**
 * The dismissible offer to install the app: a card above the page while the browser can install
 * it (or, on an iPhone, how to add it to the home screen). "Not now" hides it for good on this
 * device. Draws nothing once the app is installed.
 */
export function InstallOffer({ store = install }: { store?: InstallPromptStore }) {
  return (
    <InstallPrompt
      mode={store.visible.value ? store.mode.value : `unavailable`}
      onInstall={() => store.install()}
      onDismiss={() => store.dismiss()}
      returnFocus={focusMain}
      class="mx-auto mt-4 w-[calc(100%-2rem)] max-w-3xl sm:w-[calc(100%-3rem)]"
    />
  )
}
