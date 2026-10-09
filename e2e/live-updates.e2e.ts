import { expect, test } from "@playwright/test"
import { deleteList, retitleOnServer, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Live errand`)
})

test.afterEach(async () => await deleteList(list))

test("a task changed on the server shows up on a visible page with no reload or focus change", async ({ page }) => {
  // The page polls every 30 seconds, so allow one full interval plus a refresh.
  test.setTimeout(90_000)
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  await expect(page.getByRole(`button`, { name: `Live errand`, exact: true })).toBeVisible()

  await retitleOnServer(list.taskUrl, `Changed elsewhere`)

  await expect(page.getByRole(`button`, { name: `Changed elsewhere`, exact: true })).toBeVisible({
    timeout: 45_000,
  })
  await expect(page.getByRole(`button`, { name: `Live errand`, exact: true })).toHaveCount(0)
})
