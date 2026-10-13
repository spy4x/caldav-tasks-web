import { expect, test } from "@playwright/test"
import {
  addSeededTask,
  deleteList,
  readTask,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
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

test("on a list in manual order the keys move through the rows, open one and complete one, and do nothing in an open menu", async ({ page }) => {
  // The seeded task has no position, so it sits after these two.
  const firstUrl = await addSeededTask(list, `First`, [`X-APPLE-SORT-ORDER:100`])
  const secondUrl = await addSeededTask(list, `Second`, [`X-APPLE-SORT-ORDER:200`])
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  const first = page.getByRole(`button`, { name: `First`, exact: true })
  const second = page.getByRole(`button`, { name: `Second`, exact: true })
  await expect(first).toBeVisible()
  await expect(page.getByTestId(`sort`).locator(`option:checked`)).toHaveText(`Manual order`)

  await page.keyboard.press(`j`)
  await expect(first).toBeFocused()
  await page.keyboard.press(`j`)
  await expect(second).toBeFocused()
  await page.keyboard.press(`k`)
  await expect(first).toBeFocused()

  await page.keyboard.press(`e`)
  await expect(page).toHaveURL(/\/tasks\//)
  await page.goBack()
  await expect(first).toBeVisible()

  // An open menu keeps the keyboard: the letters neither move the focus nor complete a task.
  await page.getByRole(`button`, { name: `More actions` }).click()
  const rename = page.getByRole(`menuitem`, { name: `Rename list` })
  await expect(rename).toBeFocused()
  for (const name of [`n`, `j`, `x`]) await page.keyboard.press(name)
  await expect(rename).toBeFocused()
  await page.keyboard.press(`Escape`)
  await expect(rename).toBeHidden()

  await first.focus()
  await page.keyboard.press(`x`)
  await expect(first).toHaveCount(0)
  await expect.poll(async () => (await readTask(firstUrl)).includes(`STATUS:COMPLETED`)).toBe(true)
  await expect(second).toBeVisible()
  expect(await readTask(secondUrl)).not.toContain(`STATUS:COMPLETED`)
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
  await page.keyboard.type(`jxn?g`)
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
  await page.keyboard.type(`hello`)
  await expect(page.getByTestId(`quick-add-input`)).toHaveValue(`hello`)
})

test("/ on Today opens the search in time for the first letter", async ({ page }) => {
  await signIn(page)
  // A fresh load, as when the app is opened: the search page then draws slowly enough for a letter
  // to arrive before it has read its address.
  await page.goto(`/`)
  await expect(pageTitle(page)).toHaveText(`Today`)
  await page.keyboard.press(`/`)
  // No wait for the field: a person starts typing right away.
  await page.keyboard.type(`hello`)
  await expect(page.getByTestId(`search-input`)).toHaveValue(`hello`)
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

test("the search field keeps every letter typed right after the page opens", async ({ page }) => {
  await signIn(page)
  await page.goto(`/search`)
  await page.getByTestId(`search-input`).focus()
  await page.keyboard.type(`abcdefghij`)
  await expect(page.getByTestId(`search-input`)).toHaveValue(`abcdefghij`)
  await expect(page).toHaveURL(/q=abcdefghij/)
})
