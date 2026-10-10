/// <reference lib="webworker" />
import { installOfflineShell, type ShellScope } from "@spy4x/platform/browser/offline-shell"
import {
  installPushNotifications,
  type PushScope,
} from "@spy4x/platform/browser/push-notifications"
import { shellOptions } from "./sw-options.ts"

/** Set by the build (`serviceWorker()` in `vite.config.ts`) to a hash of the built files. */
declare const __BUILD_ID__: string

installOfflineShell(self as unknown as ShellScope, shellOptions(__BUILD_ID__))

// Shows a pushed reminder, and opens its task (or focuses the open app) when it is clicked.
installPushNotifications(self as unknown as PushScope, {
  icon: `/icons/icon-192.png`,
  defaultUrl: `/`,
})
