import { expect, type Page, test } from "@playwright/test"
import { pageTitle, signIn } from "./sign-in.ts"

/** Fires the event Chrome fires when the app can be installed, as the page would see it. */
function offerInstall(page: Page): Promise<void> {
  return page.evaluate(() => {
    const event = Object.assign(new Event(`beforeinstallprompt`, { cancelable: true }), {
      prompt: () => {
        ;(globalThis as unknown as { __installPrompted: number }).__installPrompted =
          ((globalThis as unknown as { __installPrompted?: number }).__installPrompted ?? 0) + 1
        return Promise.resolve()
      },
      userChoice: Promise.resolve({ outcome: `accepted` }),
    })
    globalThis.dispatchEvent(event)
  })
}

const offer = (page: Page) => page.getByRole(`region`, { name: `Install this app` })

test(`offers to install, and a dismissed offer does not come back after a reload`, async ({ page }) => {
  await signIn(page)
  await page.evaluate(() => localStorage.removeItem(`install-prompt-dismissed`))
  await page.reload()
  await expect(pageTitle(page)).toBeVisible()
  await expect(offer(page)).toHaveCount(0)

  await offerInstall(page)
  await expect(offer(page)).toBeVisible()

  // The keyboard dismisses it.
  await offer(page).getByRole(`button`, { name: `Not now` }).focus()
  await page.keyboard.press(`Enter`)
  await expect(offer(page)).toHaveCount(0)

  await page.reload()
  await expect(pageTitle(page)).toBeVisible()
  await offerInstall(page)
  await expect(offer(page)).toHaveCount(0)
})

test(`Settings has an Install entry that opens the browser's dialog`, async ({ page }) => {
  await signIn(page)
  await page.evaluate(() => localStorage.setItem(`install-prompt-dismissed`, `1`))
  await page.goto(`/settings`)
  await expect(page.getByTestId(`settings-install`)).toHaveCount(0)
  await offerInstall(page)
  // The entry stays after "Not now": the person can still choose to install.
  await page.getByTestId(`install-app`).click()
  await expect.poll(() =>
    page.evaluate(() => (globalThis as unknown as { __installPrompted?: number }).__installPrompted)
  ).toBe(1)
})
