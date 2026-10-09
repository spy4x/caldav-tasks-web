import { useSignal } from "@preact/signals"
import { SettingsScreen } from "@ui/settings-screen.tsx"
import { caldavAccount, signOut } from "../state/session.ts"
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
      onSignOut={async () => {
        busy.value = true
        error.value = await signOut()
        busy.value = false
      }}
    />
  )
}
