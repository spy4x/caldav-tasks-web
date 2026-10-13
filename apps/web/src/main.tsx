import { render } from "preact"
import { themeStore } from "./state/theme.ts"
import { App } from "./app.tsx"
import { AppBoundary } from "./app-boundary.tsx"
import { startPwa } from "./pwa.ts"
import { install } from "./state/install.ts"
import { loadShortcutsPreference } from "./shortcuts.ts"

// The browser can offer the install dialog before the app renders, so listening starts here.
install.watch()

// Follows the system light/dark setting. `index.html` paints the stored choice before this runs.
themeStore.attach()

// The "Keyboard shortcuts" switch as this device remembers it, before the first key can arrive.
loadShortcutsPreference()

render(
  <AppBoundary>
    <App />
  </AppBoundary>,
  document.getElementById("app") as HTMLElement,
)
startPwa()
