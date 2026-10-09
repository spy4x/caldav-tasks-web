import { createToastStore } from "@spy4x/preact-signals/toast"

/** The app's one toast list. `App` renders it through `Toastr`; any view pushes with `.success()`. */
export const toasts = createToastStore()
