import { expect, type Page } from "@playwright/test"
import { OWNER_PASSWORD } from "./env.ts"

/** Signs in through the sign-in screen and waits for the app behind it. */
export async function signIn(page: Page): Promise<void> {
  await page.goto(`/`)
  await page.getByLabel(`Password`).fill(OWNER_PASSWORD)
  await page.getByRole(`button`, { name: `Sign in` }).click()
  await expect(page.getByTestId(`page-title`)).toBeVisible()
}
