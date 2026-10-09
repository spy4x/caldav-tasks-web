import { expect, test } from "@playwright/test"
import {
  addSeededTask,
  deleteList,
  readList,
  readTask,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
import { pageTitle, signIn, submitPassword } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Seeded errand`, [
    `DUE;VALUE=DATE:20200101`,
    `X-E2E-KEEP:still here`,
    `BEGIN:VALARM`,
    `ACTION:DISPLAY`,
    `DESCRIPTION:Reminder`,
    `TRIGGER:-PT15M`,
    `END:VALARM`,
  ])
})

test.afterEach(async () => await deleteList(list))

test("adds a task on Today, edits its title, completes it and undoes the completion", async ({ page }) => {
  await signIn(page)
  await expect(pageTitle(page)).toHaveText(`Today`)

  // The lists load after the page does; a quick add before then has nowhere to go.
  await expect(page.getByRole(`button`, { name: `Seeded errand` })).toBeVisible()
  await page.getByTestId(`quick-add-input`).fill(`Pay the rent`)
  await page.getByTestId(`quick-add-submit`).click()
  const row = page.getByRole(`button`, { name: `Pay the rent` })
  await expect(row).toBeVisible()

  await row.click()
  await expect(page).toHaveURL(/\/tasks\//)
  await page.getByTestId(`task-title`).fill(`Pay the rent today`)
  await page.getByTestId(`task-save`).click()
  await expect(page).toHaveURL(/\/lists\//)
  await page.goto(`/`)
  const renamed = page.getByRole(`button`, { name: `Pay the rent today` })
  await expect(renamed).toBeVisible()

  await page.getByRole(`checkbox`, { name: /Pay the rent today/ }).click()
  await expect(renamed).toHaveCount(0)
  await page.getByRole(`button`, { name: `Undo` }).click()
  await expect(renamed).toBeVisible()
})

test("an edit keeps the reminder and the property this app does not know on the server", async ({ page }) => {
  await signIn(page)
  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByTestId(`task-title`).fill(`Seeded errand edited`)
  await page.getByTestId(`task-save`).click()
  await expect(page).toHaveURL(/\/lists\//)

  await expect.poll(async () => await readTask(list.taskUrl)).toContain(
    `SUMMARY:Seeded errand edited`,
  )
  const ics = await readTask(list.taskUrl)
  expect(ics).toContain(`BEGIN:VALARM`)
  expect(ics).toContain(`TRIGGER:-PT15M`)
  expect(ics).toContain(`X-E2E-KEEP:still here`)
})

test("the sort and the tag filter of a list survive a reload", async ({ page }) => {
  await addSeededTask(list, `Zebra`, [`CATEGORIES:home`, `PRIORITY:1`])
  await addSeededTask(list, `Apple`, [`CATEGORIES:work`, `PRIORITY:9`])
  await signIn(page)
  await page.goto(new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!.replace(
    /^/,
    `/lists/`,
  ))
  const titles = page.getByTestId(`task-tree`).getByRole(`button`)
  await expect(titles.first()).toBeVisible()

  await page.getByTestId(`sort`).selectOption({ label: `Title` })
  await expect(page).toHaveURL(/sort=title/)
  await page.getByRole(`button`, { name: `home` }).click()
  await expect(page).toHaveURL(/tags=home/)
  await expect(page.getByRole(`button`, { name: `Apple` })).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(/sort=title/)
  await expect(page).toHaveURL(/tags=home/)
  await expect(page.getByTestId(`sort`)).toHaveValue(`4`)
  await expect(page.getByRole(`button`, { name: `Zebra` })).toBeVisible()
  await expect(page.getByRole(`button`, { name: `Apple` })).toHaveCount(0)
})

test("undoing a delete puts the task back on the server", async ({ page }) => {
  await signIn(page)
  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByRole(`button`, { name: `More actions` }).click()
  await page.getByRole(`menuitem`, { name: `Delete` }).click()
  await page.getByRole(`button`, { name: `Delete` }).last().click()
  await expect(page).toHaveURL(/\/lists\//)
  await expect.poll(async () => await readList(list)).not.toContain(`SUMMARY:Seeded errand`)

  await page.getByRole(`button`, { name: `Undo` }).click()
  await expect(page.getByRole(`button`, { name: `Seeded errand` })).toBeVisible()
  await expect.poll(async () => await readList(list)).toContain(`SUMMARY:Seeded errand`)
  const restored = await readList(list)
  expect(restored).toContain(`X-E2E-KEEP:still here`)
  expect(restored).toContain(`TRIGGER:-PT15M`)
})

test("a signed-out visit to a page asks for the password and then opens that page", async ({ page }) => {
  await page.goto(`/lists`)
  await expect(page).toHaveURL(/\/sign-in\?next=/)
  await submitPassword(page)
  await expect(page).toHaveURL(/\/lists$/)
  await expect(pageTitle(page)).toHaveText(`Lists`)
})
