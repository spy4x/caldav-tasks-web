import {
  createInstallPrompt,
  type InstallPromptPorts,
  type InstallPromptStore,
} from "@spy4x/preact-signals/install-prompt"
import { createSignedInHint } from "@spy4x/platform/browser/signed-in-hint"
import type { KeyValueStore } from "@spy4x/platform/universal/key-value-store"

/** The browser storage key that remembers a "Not now" on this device. */
export const INSTALL_DISMISSED_KEY = `install-prompt-dismissed`

/**
 * A prompt store whose "Not now" is kept in `storage` (default: `localStorage`). The stored text is
 * `1`. Blocked or missing storage remembers nothing, so the offer shows again after a reload,
 * which is harmless. `ports` replace the browser's window, navigator and media queries, for tests.
 */
export function createAppInstall(
  storage?: KeyValueStore | null,
  ports: Omit<InstallPromptPorts, `dismissed`> = {},
): InstallPromptStore {
  const flag = createSignedInHint<1>(INSTALL_DISMISSED_KEY, {
    validate: (value): value is 1 => value === 1,
    storage,
  })
  return createInstallPrompt({
    ...ports,
    dismissed: {
      read: () => flag.recall() === 1,
      write: (value) => value ? flag.remember(1) : flag.forget(),
    },
  })
}

/**
 * Whether the app can be installed here, and whether the person said "not now". `main.tsx` calls
 * `watch()` before the first render, because the browser can offer the install dialog early.
 */
export const install = createAppInstall()
