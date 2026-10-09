/// <reference lib="deno.ns" />
// A helper for the view tests, not a test file.
import type { ComponentChildren } from "preact"
import { mount, type Mounted } from "@ui/mount.test.tsx"

const ownFormData = globalThis.FormData

/**
 * Mounts `ui` in a happy-dom page, with the globals the screens read from it: `EnhancedForm` makes
 * a `FormData` from the form, which Deno's own class refuses for a happy-dom form, and the
 * address helpers read `location`.
 */
export function onPage(
  ui: ComponentChildren,
  test: (mounted: Mounted) => Promise<void>,
): Promise<void> {
  return mount(ui, async (mounted) => {
    const own = Object.getOwnPropertyDescriptor(globalThis, `location`)
    Object.assign(globalThis, { FormData: mounted.window.FormData })
    Object.defineProperty(globalThis, `location`, {
      value: mounted.window.location,
      configurable: true,
    })
    try {
      await test(mounted)
    } finally {
      Object.assign(globalThis, { FormData: ownFormData })
      if (own) Object.defineProperty(globalThis, `location`, own)
      else Reflect.deleteProperty(globalThis, `location`)
    }
  })
}
