import { expect, test } from "@playwright/test"
import { deleteList, readTask, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { pageTitle, signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Shortcut errand`, [`DUE;VALUE=DATE:20200101`])
})

test.afterEach(async () => await deleteList(list))

test("keys move through the tasks, complete one, open one and go to other pages", async ({ page }) => {
  await signIn(page)
  await expect(pageTitle(page)).toHaveText(`Today`)
  const open = page.getByRole(`button`, { name: `Shortcut errand` })

  // j lands on a row; the account may hold other lists' tasks, so then aim at this test's own.
  await expect(open).toBeVisible()
  await page.keyboard.press(`j`)
  await expect(page.locator(`li[data-task-uid] [data-e2e="task-open"]:focus`)).toHaveCount(1)

  await open.focus()
  await page.keyboard.press(`e`)
  await expect(page).toHaveURL(/\/tasks\//)
  await page.goBack()

  await page.keyboard.press(`g`)
  await page.keyboard.press(`l`)
  await expect(pageTitle(page)).toHaveText(`Lists`)
  await page.keyboard.press(`g`)
  await page.keyboard.press(`t`)
  await expect(pageTitle(page)).toHaveText(`Today`)

  await open.focus()
  await page.keyboard.press(`x`)
  await expect(open).toHaveCount(0)
  await expect.poll(async () => (await readTask(list.taskUrl)).includes(`STATUS:COMPLETED`))
    .toBe(true)
})

test("? lists the shortcuts and Escape closes the list, and typing in a field fires none", async ({ page }) => {
  await signIn(page)
  await page.keyboard.press(`?`)
  const dialog = page.getByRole(`dialog`, { name: `Keyboard shortcuts` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(`Go to Upcoming`)).toBeVisible()
  await page.keyboard.press(`Escape`)
  await expect(dialog).toBeHidden()

  await page.keyboard.press(`/`)
  await expect(page.getByTestId(`search-input`)).toBeFocused()
  // A key typed in the first moments after the page loads can be lost (see the PR); wait a little.
  await page.keyboard.type(`jxn?g`, { delay: 60 })
  await expect(page.getByTestId(`search-input`)).toHaveValue(`jxn?g`)
  await expect(dialog).toBeHidden()
})

test("Settings opens the shortcuts list", async ({ page }) => {
  await signIn(page)
  await page.goto(`/settings`)
  await page.getByTestId(`show-shortcuts`).click()
  await expect(page.getByRole(`dialog`, { name: `Keyboard shortcuts` })).toBeVisible()
})

test("n on Lists focuses the new-task field in time for the first letter", async ({ page }) => {
  await signIn(page)
  await page.goto(`/lists`)
  await expect(pageTitle(page)).toHaveText(`Lists`)
  await page.keyboard.press(`n`)
  // No wait for the field: a person starts typing right away.
  await page.keyboard.type(`hello`, { delay: 100 })
  await expect(page.getByTestId(`quick-add-input`)).toHaveValue(`hello`)
})

test("/ on a search with a query keeps the query", async ({ page }) => {
  await signIn(page)
  await page.goto(`/search?q=foo`)
  await expect(page.getByTestId(`search-input`)).toHaveValue(`foo`)
  await page.getByRole(`heading`).first().click()
  await page.keyboard.press(`/`)
  await expect(page.getByTestId(`search-input`)).toBeFocused()
  await expect(page.getByTestId(`search-input`)).toHaveValue(`foo`)
  await expect(page).toHaveURL(/q=foo/)
})
