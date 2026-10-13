import { useSignal } from "@preact/signals"
import { SettingsScreen } from "@ui/settings-screen.tsx"
import { shortcutsOpen } from "../shortcuts.ts"
import { caldavAccount } from "../state/session.ts"
import { signOutOfDevice, unsentChanges } from "../state/sign-out.ts"
import { install } from "../state/install.ts"
import { push, PUSH_UNREACHABLE, pushKeyUnreachable } from "../state/push.ts"
import { installFromSettings } from "./install-from-settings.ts"
import { themeStore } from "../state/theme.ts"
import { APP_VERSION } from "../version.ts"
import { browserZone } from "./clock.ts"

/**
 * Settings, wired. Signing out deletes what this device keeps and sends the gate to Sign in; a
 * refusal stays here as a message.
 */
export function SettingsView() {
  const busy = useSignal(false)
  const error = useSignal<string | null>(null)
  /** How many unsent changes the open question is about, or `null` when none is asked. */
  const asking = useSignal<number | null>(null)
  const run = async (): Promise<void> => {
    busy.value = true
    error.value = await signOutOfDevice()
    busy.value = false
  }
  return (
    <SettingsScreen
      themeStore={themeStore}
      caldavUrl={caldavAccount.value?.url ?? null}
      caldavUsername={caldavAccount.value?.username ?? null}
      timeZone={browserZone()}
      version={APP_VERSION}
      signingOut={busy.value}
      error={error.value}
      installMode={install.mode.value}
      onInstall={() => void installFromSettings(install)}
      push={{
        status: push.status.value,
        busy: push.busy.value,
        failed: push.failed.value,
        sent: push.sent.value,
        onEnable: () => void push.enable(),
        onDisable: () => void push.disable(),
        onTest: () => void push.test(),
        labels: pushKeyUnreachable.value ? { unavailable: PUSH_UNREACHABLE } : undefined,
      }}
      onShowShortcuts={() => shortcutsOpen.value = true}
      onSignOut={async () => {
        busy.value = true
        // Read from the queue's store, so a press before the queue has loaded still asks.
        const unsent = await unsentChanges()
        if (unsent > 0) {
          busy.value = false
          asking.value = unsent
        } else await run()
      }}
      unsentQuestion={asking.value === null ? undefined : {
        unsent: asking.value,
        onConfirm: () => {
          asking.value = null
          void run()
        },
        onCancel: () => asking.value = null,
      }}
    />
  )
}
