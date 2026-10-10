import { useSignal } from "@preact/signals"
import { SettingsScreen } from "@ui/settings-screen.tsx"
import { shortcutsOpen } from "../shortcuts.ts"
import { caldavAccount, signOut } from "../state/session.ts"
import { install } from "../state/install.ts"
import { installFromSettings } from "./install-from-settings.ts"
import { themeStore } from "../state/theme.ts"
import { APP_VERSION } from "../version.ts"
import { browserZone } from "./clock.ts"

/** Settings, wired. Signing out sends the gate to Sign in; a refusal stays here as a message. */
export function SettingsView() {
  const busy = useSignal(false)
  const error = useSignal<string | null>(null)
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
      onShowShortcuts={() => shortcutsOpen.value = true}
      onSignOut={async () => {
        busy.value = true
        error.value = await signOut()
        busy.value = false
      }}
    />
  )
}
