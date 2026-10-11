import { expect, type Page, test } from "@playwright/test"
import {
  deleteList,
  readTask,
  retitleOnServer,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Seeded errand`, [`DESCRIPTION:Seeded notes`])
})

test.afterEach(async () => await deleteList(list))

/** Opens the seeded task in the editor, from its list. */
async function openEditor(page: Page): Promise<void> {
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  await page.getByRole(`button`, { name: `Seeded errand`, exact: true }).click()
  await expect(page.getByTestId(`task-title`)).toHaveValue(`Seeded errand`)
}

const conflictDialog = (page: Page) =>
  page.getByRole(`alertdialog`, { name: `Changed on another device` })

test("Keep mine after the title changed elsewhere keeps the typed title in the form and writes it to the server", async ({ page }) => {
  await openEditor(page)
  await page.getByTestId(`task-title`).fill(`Mine`)
  await retitleOnServer(list.taskUrl, `Theirs`)

  await page.getByTestId(`task-save`).click()

  await expect(conflictDialog(page)).toBeVisible()
  await expect(page.getByTestId(`task-title`)).toHaveValue(`Mine`)
  await page.getByRole(`button`, { name: `Keep mine` }).click()

  await expect(page.getByRole(`button`, { name: `Mine`, exact: true })).toBeVisible()
  expect(await readTask(list.taskUrl)).toContain(`SUMMARY:Mine`)
})

test("Use theirs after the title changed elsewhere loads their title and leaves the server's copy alone", async ({ page }) => {
  await openEditor(page)
  await page.getByTestId(`task-title`).fill(`Mine`)
  await retitleOnServer(list.taskUrl, `Theirs`)

  await page.getByTestId(`task-save`).click()

  await expect(conflictDialog(page)).toBeVisible()
  await page.getByRole(`button`, { name: `Use theirs` }).click()

  await expect(conflictDialog(page)).toHaveCount(0)
  await expect(page.getByTestId(`task-title`)).toHaveValue(`Theirs`)
  expect(await readTask(list.taskUrl)).toContain(`SUMMARY:Theirs`)
})

test("notes typed while the title changes elsewhere survive the page's refresh, and Save keeps both", async ({ page }) => {
  await openEditor(page)
  await page.getByTestId(`task-notes`).fill(`My notes`)
  // The refresh that brings their title: the list read whose answer holds it.
  const refreshed = page.waitForResponse(async (response) =>
    response.url().includes(`calendar=`) && (await response.text()).includes(`SUMMARY:Theirs`)
  )
  await retitleOnServer(list.taskUrl, `Theirs`)
  // The page refreshes when its window gains focus; live-updates.e2e.ts covers the 30-second poll.
  await page.evaluate(() => globalThis.dispatchEvent(new Event(`focus`)))
  await refreshed

  await expect(page.getByTestId(`task-notes`)).toHaveValue(`My notes`)
  await page.getByTestId(`task-save`).click()

  await expect(page.getByRole(`button`, { name: `Theirs`, exact: true })).toBeVisible()
  const stored = await readTask(list.taskUrl)
  expect(stored).toContain(`SUMMARY:Theirs`)
  expect(stored).toContain(`DESCRIPTION:My notes`)
})
