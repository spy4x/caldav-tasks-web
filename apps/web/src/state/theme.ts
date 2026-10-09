import { createThemeStore } from "@spy4x/preact-signals/theme"

/**
 * The app's one theme store. `main.tsx` attaches it (follow the system setting, remember the
 * choice) and the Settings screen cycles it.
 */
export const themeStore = createThemeStore()
