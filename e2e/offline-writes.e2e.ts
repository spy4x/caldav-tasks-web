import { expect, type Page, test } from "@playwright/test"
import {
  addSeededTask,
  deleteList,
  deleteOnServer,
  readList,
  readTask,
  retitleOnServer,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
import { signIn, underWorker } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Seeded errand`)
})

test.afterEach(async () => await deleteList(list))

/** Opens the seeded list's own page, where a quick add lands in the list the test removes. */
async function openList(page: Page): Promise<void> {
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  await expect(page.getByRole(`button`, { name: `Seeded errand` })).toBeVisible()
}

const waiting = (page: Page, count: number) =>
  page.getByText(`Offline, ${count} ${count === 1 ? `change` : `changes`} waiting`)

test("a task added, edited, completed and deleted offline reaches the server after reconnect", async ({ page, context }) => {
  const toComplete = await addSeededTask(list, `To complete`)
  await addSeededTask(list, `To delete`)
  await openList(page)
  await expect(page.getByRole(`button`, { name: `To delete` })).toBeVisible()

  await context.setOffline(true)

  await page.getByTestId(`quick-add-input`).fill(`Offline new`)
  await page.getByTestId(`quick-add-submit`).click()
  await expect(page.getByRole(`button`, { name: `Offline new` })).toBeVisible()

  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByTestId(`task-title`).fill(`Seeded renamed`)
  await page.getByTestId(`task-save`).click()
  await expect(page.getByRole(`button`, { name: `Seeded renamed` })).toBeVisible()

  await page.getByRole(`checkbox`, { name: /To complete/ }).click()
  await expect(page.getByRole(`button`, { name: `To complete` })).toHaveCount(0)

  await page.getByRole(`button`, { name: `To delete` }).click()
  await page.getByRole(`button`, { name: `More actions` }).click()
  await page.getByRole(`menuitem`, { name: `Delete` }).click()
  await page.getByRole(`button`, { name: `Delete` }).last().click()
  await expect(page.getByRole(`button`, { name: `To delete` })).toHaveCount(0)

  await expect(waiting(page, 4)).toBeVisible()
  // Nothing has left the device.
  const before = await readList(list)
  expect(before).toContain(`SUMMARY:Seeded errand`)
  expect(before).toContain(`SUMMARY:To delete`)
  expect(before).not.toContain(`Offline new`)
  expect(await readTask(toComplete)).not.toContain(`STATUS:COMPLETED`)

  await context.setOffline(false)

  await expect.poll(async () => {
    const text = await readList(list)
    return text.includes(`SUMMARY:Offline new`) && text.includes(`SUMMARY:Seeded renamed`) &&
      !text.includes(`SUMMARY:To delete`) &&
      (await readTask(toComplete)).includes(`STATUS:COMPLETED`)
  }).toBe(true)
  await expect(page.getByText(/waiting/)).toHaveCount(0)
  await expect(page.getByText(`Offline: showing your last copy`)).toHaveCount(0)
})

test("a task changed on the server while offline offers Keep mine, which writes the offline edit over it", async ({ page, context }) => {
  await openList(page)
  await context.setOffline(true)
  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByTestId(`task-title`).fill(`Mine`)
  await page.getByTestId(`task-save`).click()
  await expect(page.getByRole(`button`, { name: `Mine` })).toBeVisible()
  await retitleOnServer(list.taskUrl, `Theirs`)

  await context.setOffline(false)

  await expect(page.getByRole(`heading`, { name: `1 change needs your choice` })).toBeVisible()
  expect(await readTask(list.taskUrl)).toContain(`SUMMARY:Theirs`)
  await page.getByRole(`button`, { name: `Keep mine` }).click()

  await expect.poll(async () => await readTask(list.taskUrl)).toContain(`SUMMARY:Mine`)
  await expect(page.getByRole(`heading`, { name: `1 change needs your choice` })).toHaveCount(0)
  await expect(page.getByRole(`button`, { name: `Mine` })).toBeVisible()
})

test("a task changed on the server while offline offers Use theirs, which drops the offline edit", async ({ page, context }) => {
  await openList(page)
  await context.setOffline(true)
  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByTestId(`task-title`).fill(`Mine`)
  await page.getByTestId(`task-save`).click()
  await expect(page.getByRole(`button`, { name: `Mine` })).toBeVisible()
  await retitleOnServer(list.taskUrl, `Theirs`)

  await context.setOffline(false)

  await expect(page.getByRole(`heading`, { name: `1 change needs your choice` })).toBeVisible()
  await page.getByRole(`button`, { name: `Use theirs` }).click()

  await expect(page.getByRole(`button`, { name: `Theirs` })).toBeVisible()
  await expect(page.getByRole(`button`, { name: `Mine` })).toHaveCount(0)
  await expect(page.getByRole(`heading`, { name: `1 change needs your choice` })).toHaveCount(0)
  expect(await readTask(list.taskUrl)).toContain(`SUMMARY:Theirs`)
})

test("a task deleted on the server while offline can only be discarded", async ({ page, context }) => {
  await openList(page)
  await context.setOffline(true)
  await page.getByRole(`button`, { name: `Seeded errand` }).click()
  await page.getByTestId(`task-title`).fill(`Mine`)
  await page.getByTestId(`task-save`).click()
  await expect(page.getByRole(`button`, { name: `Mine` })).toBeVisible()
  await deleteOnServer(list.taskUrl)

  await context.setOffline(false)

  await expect(page.getByRole(`heading`, { name: `1 change needs your choice` })).toBeVisible()
  await expect(page.getByRole(`button`, { name: `Keep mine` })).toHaveCount(0)
  await page.getByRole(`button`, { name: `Discard mine` }).click()
  await expect(page.getByRole(`button`, { name: `Mine` })).toHaveCount(0)
})

test("a reload while offline keeps the queued writes, and they are sent when the network returns", async ({ page, context }) => {
  await openList(page)
  await underWorker(page)
  await expect(page.getByRole(`button`, { name: `Seeded errand` })).toBeVisible()
  await context.setOffline(true)
  await page.getByTestId(`quick-add-input`).fill(`Kept offline`)
  await page.getByTestId(`quick-add-submit`).click()
  await expect(page.getByRole(`button`, { name: `Kept offline` })).toBeVisible()

  await page.reload()

  await expect(page.getByRole(`button`, { name: `Kept offline` })).toBeVisible()
  await expect(waiting(page, 1)).toBeVisible()
  expect(await readList(list)).not.toContain(`Kept offline`)

  await context.setOffline(false)

  await expect.poll(async () => await readList(list)).toContain(`SUMMARY:Kept offline`)
  await expect(page.getByText(/waiting/)).toHaveCount(0)
})
