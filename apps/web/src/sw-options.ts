import type { OfflineShellOptions } from "@spy4x/platform/browser/offline-shell"

/**
 * What the service worker caches. `buildId` changes with every build, so a new deploy gets a new
 * cache name and the library deletes the old `shell-*` cache when the new worker activates.
 *
 * Only the page is listed: the library also stores the hashed scripts and styles, the manifest and
 * the icons that the page links to. `/api` (task data belongs to the IndexedDB cache) and `/health`
 * are never touched.
 */
export function shellOptions(buildId: string): OfflineShellOptions {
  return {
    shellUrls: [`/`],
    cacheName: `shell-${buildId}`,
    neverCache: [`/api`, `/health`],
  }
}
