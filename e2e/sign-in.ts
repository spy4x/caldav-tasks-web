import { expect, type Page } from "@playwright/test"
import { OWNER_PASSWORD } from "./env.ts"

/**
 * The heading of the page the app shows inside its frame. The sign-in screen has no frame, so it
 * does not match.
 */
export function pageTitle(page: Page) {
  return page.getByRole(`main`).getByRole(`heading`, { level: 1 }).filter({
    hasNotText: `Sign in`,
  })
}

/** Types the owner password into the sign-in screen and presses Sign in. */
export async function submitPassword(page: Page): Promise<void> {
  await page.getByLabel(`Password`).fill(OWNER_PASSWORD)
  await page.getByRole(`button`, { name: `Sign in` }).click()
}

/** Signs in through the sign-in screen and waits for the app behind it. */
export async function signIn(page: Page): Promise<void> {
  await page.goto(`/`)
  await submitPassword(page)
  await expect(pageTitle(page)).toBeVisible()
}
