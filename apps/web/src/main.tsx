import { render } from "preact"
import { createThemeStore } from "@spy4x/preact-signals/theme"
import { App } from "./app.tsx"
import { startPwa } from "./pwa.ts"

// Follows the system light/dark setting. `index.html` paints the stored choice before this runs.
createThemeStore().attach()

// TODO: render under an error boundary once spy4x/preact-components#581 ships one. There is no
// local stand-in on purpose: the library owns it.
render(<App />, document.getElementById("app") as HTMLElement)
startPwa()
