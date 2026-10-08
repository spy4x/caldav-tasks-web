import { expect, test } from "@playwright/test"
import { readTask, seedTaskList } from "./fixtures/radicale.ts"

test("answers /health with 200", async ({ request }) => {
  const response = await request.get(`/health`)
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: `ok` })
})

test("opens on Today and moves between the five destinations without a reload", async ({ page }) => {
  await page.goto(`/`)
  const nav = page.getByRole(`navigation`, { name: `Main navigation` })
  await expect(nav.getByRole(`link`)).toHaveText([
    `Today`,
    `Upcoming`,
    `Lists`,
    `Search`,
    `More`,
  ])
  await expect(page.getByTestId(`page-title`)).toHaveText(`Today`)

  // The page object survives a client-side move; a full load would replace it.
  await page.evaluate(() => (globalThis as { __kept?: boolean }).__kept = true)
  await nav.getByRole(`link`, { name: `Upcoming` }).click()
  await expect(page).toHaveURL(/\/upcoming$/)
  await expect(page.getByTestId(`page-title`)).toHaveText(`Upcoming`)
  expect(await page.evaluate(() => (globalThis as { __kept?: boolean }).__kept)).toBe(true)
})

test("serves the shell on a deep link and after a reload", async ({ page }) => {
  await page.goto(`/lists`)
  await expect(page.getByTestId(`page-title`)).toHaveText(`Lists`)
  await page.reload()
  await expect(page.getByTestId(`page-title`)).toHaveText(`Lists`)
})

test("the Radicale fixture seeds a readable task list", async () => {
  const list = await seedTaskList(`Smoke task`)
  const ics = await readTask(list.taskUrl)
  expect(ics).toContain(`SUMMARY:Smoke task`)
  expect(ics).toContain(`UID:${list.uid}`)
})
