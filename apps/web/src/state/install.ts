import {
  createInstallPrompt,
  type InstallPromptPorts,
  type InstallPromptStore,
} from "@spy4x/preact-signals/install-prompt"

/** The browser storage key that remembers a "Not now" on this device. */
export const INSTALL_DISMISSED_KEY = `install-prompt-dismissed`

/**
 * A prompt store whose "Not now" is kept in `storage`. A blocked or missing storage means the offer
 * shows again after a reload, which is harmless. `ports` replace the browser's window, navigator
 * and media queries, for tests.
 */
export function createAppInstall(
  storage: Pick<Storage, `getItem` | `setItem`> | null = browserStorage(),
  ports: Omit<InstallPromptPorts, `dismissed`> = {},
): InstallPromptStore {
  return createInstallPrompt({
    ...ports,
    dismissed: {
      read: () => {
        try {
          return storage?.getItem(INSTALL_DISMISSED_KEY) === `1`
        } catch (_blocked) {
          return false
        }
      },
      write: (value) => {
        try {
          storage?.setItem(INSTALL_DISMISSED_KEY, value ? `1` : `0`)
        } catch (_blocked) {
          // The offer then shows again after a reload.
        }
      },
    },
  })
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch (_blocked) {
    return null
  }
}

/**
 * Whether the app can be installed here, and whether the person said "not now". `main.tsx` calls
 * `watch()` before the first render, because the browser can offer the install dialog early.
 */
export const install = createAppInstall()
