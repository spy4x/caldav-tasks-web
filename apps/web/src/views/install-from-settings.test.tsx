/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { memoryStorage } from "@spy4x/platform/browser/storage"
import { createAppInstall } from "../state/install.ts"
import { toasts } from "../state/toasts.ts"
import { installFromSettings } from "./install-from-settings.ts"

/** A store the browser has offered the install dialog to; `prompt` is what the dialog does. */
function offered(prompt: () => Promise<unknown>) {
  const target = new EventTarget()
  const store = createAppInstall(memoryStorage(), { target: target as never, matchMedia: null })
  store.watch()
  target.dispatchEvent(
    Object.assign(new Event(`beforeinstallprompt`, { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: `dismissed` }),
    }),
  )
  return store
}

Deno.test("a browser that refuses the install dialog shows a message and raises no error", async () => {
  const before = toasts.list.value.length
  let focused = 0
  const store = offered(() => Promise.reject(new Error(`no gesture`)))
  await installFromSettings(store, () => focused++)
  expect(toasts.list.value.length).toBe(before + 1)
  expect(toasts.list.value.at(-1)!.body).toContain(`install dialog`)
  expect(focused).toBe(1)
})

Deno.test("focus leaves the Install row for the page once the dialog is used up", async () => {
  let focused = 0
  const store = offered(() => Promise.resolve())
  await installFromSettings(store, () => focused++)
  expect(focused).toBe(1)
})
