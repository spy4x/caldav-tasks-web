import { expect, test } from "@playwright/test"
import { deleteList, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { OWNER_PASSWORD } from "./env.ts"
import { signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Expiring errand`, [`DUE;VALUE=DATE:20200101`])
})

test.afterEach(async () => await deleteList(list))

test(`a session that ends during an edit asks for the password over the editor and keeps the text`, async ({ page, context }) => {
  await signIn(page)
  await page.getByRole(`button`, { name: `Expiring errand`, exact: true }).click()
  const title = page.getByTestId(`task-title`)
  await title.fill(`Typed before the session ended`)

  // The session ends: the browser no longer holds its cookie.
  await context.clearCookies()
  await page.getByTestId(`task-save`).click()

  const dialog = page.getByRole(`dialog`, { name: `Sign in again` })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/tasks\//)
  await expect(title).toHaveValue(`Typed before the session ended`)
  await expect(dialog.getByLabel(`Password`)).toBeFocused()
  // Escape is no way out: without a session the text could only be lost.
  await page.keyboard.press(`Escape`)
  await expect(dialog).toBeVisible()

  await dialog.getByLabel(`Password`).fill(OWNER_PASSWORD)
  await dialog.getByRole(`button`, { name: `Sign in` }).click()
  await expect(dialog).toBeHidden()
  await expect(title).toHaveValue(`Typed before the session ended`)

  await page.getByTestId(`task-save`).click()
  await expect(page.getByRole(`button`, { name: `Typed before the session ended`, exact: true }))
    .toBeVisible()
})
