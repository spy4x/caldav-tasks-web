/// <reference lib="webworker" />
import { installOfflineShell, type ShellScope } from "@spy4x/platform/browser/offline-shell"
import { shellOptions } from "./sw-options.ts"

/** Set by the build (`service-worker.ts` in this app's Vite plugin) to a hash of the built files. */
declare const __BUILD_ID__: string

installOfflineShell(self as unknown as ShellScope, shellOptions(__BUILD_ID__))
