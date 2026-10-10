/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { memoryStorage } from "@spy4x/platform/browser/storage"
import { must } from "@ui/mount.test.tsx"
import { createAppInstall } from "../state/install.ts"
import { onPage } from "./on-page.test.tsx"
import { InstallOffer } from "./InstallOffer.tsx"

/** A fake window that can fire `beforeinstallprompt`, and what the install dialog was asked. */
function fakeBrowser(outcome: `accepted` | `dismissed` = `accepted`) {
  const target = new EventTarget()
  const calls = { prompted: 0 }
  return {
    target: target as never,
    calls,
    offer: () => {
      const event = Object.assign(new Event(`beforeinstallprompt`, { cancelable: true }), {
        prompt: () => {
          calls.prompted++
          return Promise.resolve()
        },
        userChoice: Promise.resolve({ outcome }),
      })
      target.dispatchEvent(event)
    },
  }
}

/** Whether the offer card is in the page. */
function offered(root: HTMLElement): boolean {
  return root.querySelector(`[data-install-mode]`) !== null
}

const IPHONE = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15`

Deno.test("the offer appears when the browser can install the app and the button opens its dialog", async () => {
  const browser = fakeBrowser()
  const store = createAppInstall(memoryStorage(), { target: browser.target, matchMedia: null })
  store.watch()
  await onPage(<InstallOffer store={store} />, async ({ root, act }) => {
    expect(offered(root)).toBe(false)
    await act(() => browser.offer())
    const card = must(root, `[data-install-mode="prompt"]`)
    expect(card.getAttribute(`aria-label`)).toBe(`Install this app`)
    await act(() => must<HTMLButtonElement>(root, `button`).click())
    await new Promise((resolve) => setTimeout(resolve, 0))
    await act(() => {})
    expect(browser.calls.prompted).toBe(1)
    // Accepted: the app is installed, so the offer goes.
    expect(offered(root)).toBe(false)
  })
})

Deno.test("Not now hides the offer and it stays hidden after a reload", async () => {
  const storage = memoryStorage()
  const first = fakeBrowser()
  const store = createAppInstall(storage, { target: first.target, matchMedia: null })
  store.watch()
  await onPage(<InstallOffer store={store} />, async ({ root, act }) => {
    await act(() => first.offer())
    const notNow = [...root.querySelectorAll(`button`)].find((b) => b.textContent === `Not now`)!
    await act(() => (notNow as HTMLButtonElement).click())
    expect(offered(root)).toBe(false)
  })
  // A reload: a new store over the same storage, and the browser offers again.
  const second = fakeBrowser()
  const reloaded = createAppInstall(storage, { target: second.target, matchMedia: null })
  reloaded.watch()
  await onPage(<InstallOffer store={reloaded} />, async ({ root, act }) => {
    await act(() => second.offer())
    expect(offered(root)).toBe(false)
  })
})

Deno.test("Not now and an accepted Install move focus to the page's main, not the body", async () => {
  for (const label of [`Not now`, `Install`]) {
    const browser = fakeBrowser()
    const store = createAppInstall(memoryStorage(), { target: browser.target, matchMedia: null })
    store.watch()
    await onPage(
      <>
        <InstallOffer store={store} />
        <main tabIndex={-1}>Page</main>
      </>,
      async ({ root, act, window }) => {
        await act(() => browser.offer())
        const button = [...root.querySelectorAll(`button`)].find((b) => b.textContent === label)!
        ;(button as HTMLButtonElement).focus()
        await act(() => (button as HTMLButtonElement).click())
        await new Promise((resolve) => setTimeout(resolve, 0))
        await act(() => {})
        expect(offered(root)).toBe(false)
        expect(window.document.activeElement?.tagName, label).toBe(`MAIN`)
      },
    )
  }
})

Deno.test("on an iPhone the offer explains Add to Home Screen instead of showing Install", async () => {
  const store = createAppInstall(memoryStorage(), {
    target: null,
    navigator: { userAgent: IPHONE },
    matchMedia: null,
  })
  await onPage(<InstallOffer store={store} />, async ({ root }) => {
    const card = must(root, `[data-install-mode="ios"]`)
    expect(card.textContent).toContain(`Add to Home Screen`)
    expect([...root.querySelectorAll(`button`)].map((b) => b.textContent)).toEqual([`Not now`])
  })
})

Deno.test("an app that already runs installed shows no offer", async () => {
  const store = createAppInstall(memoryStorage(), {
    target: null,
    navigator: { userAgent: IPHONE },
    matchMedia: () => ({ matches: true }),
  })
  await onPage(<InstallOffer store={store} />, async ({ root }) => {
    expect(offered(root)).toBe(false)
  })
})

Deno.test("a storage that throws still lets the offer be dismissed for this visit", async () => {
  const blocked = {
    getItem: () => {
      throw new Error(`blocked`)
    },
    setItem: () => {
      throw new Error(`blocked`)
    },
    removeItem: () => {
      throw new Error(`blocked`)
    },
  }
  const browser = fakeBrowser()
  const store = createAppInstall(blocked, { target: browser.target, matchMedia: null })
  store.watch()
  await onPage(<InstallOffer store={store} />, async ({ root, act }) => {
    await act(() => browser.offer())
    const notNow = [...root.querySelectorAll(`button`)].find((b) => b.textContent === `Not now`)!
    await act(() => (notNow as HTMLButtonElement).click())
    expect(offered(root)).toBe(false)
  })
})
