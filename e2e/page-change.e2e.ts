import { expect, test } from "@playwright/test"
import { deleteList, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { pageTitle, signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Seeded errand`)
})

test.afterEach(async () => await deleteList(list))

test("opening a task and saving it each name the new page in the tab title and put focus on its heading", async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveTitle(`Today · Tasks`)

  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  const listName = `E2E ${slug}`
  await expect(page).toHaveTitle(`${listName} · Tasks`)

  await page.getByRole(`button`, { name: `Seeded errand`, exact: true }).click()
  await expect(page).toHaveURL(/\/tasks\//)
  await expect(page).toHaveTitle(`Seeded errand · Tasks`)
  await expect(pageTitle(page)).toHaveText(`Edit task`)
  await expect(pageTitle(page)).toBeFocused()

  await page.getByTestId(`task-title`).fill(`Seeded errand, done right`)
  await page.getByTestId(`task-save`).click()
  await expect(page).toHaveURL(/\/lists\//)
  await expect(page).toHaveTitle(`${listName} · Tasks`)
  await expect(pageTitle(page)).toHaveText(listName)
  await expect(pageTitle(page)).toBeFocused()
})

test("a middle click on a sidebar entry opens its page in a new tab", async ({ page, context }) => {
  await signIn(page)
  const nav = page.getByRole(`navigation`, { name: `Main navigation` })
  const opened = context.waitForEvent(`page`)
  await nav.getByRole(`link`, { name: `Upcoming` }).click({ button: `middle` })
  const tab = await opened
  await expect(tab).toHaveURL(/\/upcoming$/)
  await expect(pageTitle(tab)).toHaveText(`Upcoming`)
  // The first tab stayed where it was.
  await expect(pageTitle(page)).toHaveText(`Today`)
})
