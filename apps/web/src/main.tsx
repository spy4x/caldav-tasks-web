import { render } from "preact"
import { themeStore } from "./state/theme.ts"
import { App } from "./app.tsx"
import { startPwa } from "./pwa.ts"
import { install } from "./state/install.ts"

// The browser can offer the install dialog before the app renders, so listening starts here.
install.watch()

// Follows the system light/dark setting. `index.html` paints the stored choice before this runs.
themeStore.attach()

// TODO: render under an error boundary once spy4x/preact-components#581 ships one. There is no
// local stand-in on purpose: the library owns it.
render(<App />, document.getElementById("app") as HTMLElement)
startPwa()
