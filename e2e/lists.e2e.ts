import { expect, test } from "@playwright/test"
import { RADICALE_URL } from "./env.ts"
import {
  addSeededTask,
  deleteList,
  readCalendar,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
import { pageTitle, signIn } from "./sign-in.ts"

/** Lists this run created on Radicale, removed afterwards whatever happened. */
const created: SeededList[] = []

test.afterEach(async () => {
  for (const list of created.splice(0)) await deleteList(list)
})

/** The Radicale address of the list whose page is open. */
function calendarUrlOf(pageUrl: string): string {
  const slug = new URL(pageUrl).pathname.split(`/`)[2]
  return `${RADICALE_URL}/e2e/${decodeURIComponent(slug)}/`
}

test("creates a list with a colour Tasks.org reads, then renames and recolours it", async ({ page }) => {
  const name = `E2E list ${crypto.randomUUID().slice(0, 8)}`
  await signIn(page)
  await page.goto(`/lists`)
  await page.getByRole(`button`, { name: `New list` }).click()
  await expect(pageTitle(page)).toHaveText(`New list`)
  await page.getByTestId(`list-name`).fill(name)
  await page.getByTestId(`list-color`).fill(`#e07a5f`)
  await page.getByTestId(`list-save`).click()
  await expect(pageTitle(page)).toHaveText(name)
  const calendarUrl = calendarUrlOf(page.url())
  created.push({ calendarUrl, taskUrl: ``, uid: ``, title: `` })
  expect(await readCalendar(calendarUrl)).toEqual({ displayName: name, color: `#E07A5FFF` })

  await page.getByRole(`button`, { name: `More actions` }).click()
  await page.getByRole(`menuitem`, { name: `Rename list` }).click()
  await page.getByTestId(`list-name`).fill(`${name} renamed`)
  await page.getByTestId(`list-color`).fill(`#3d405b`)
  await page.getByTestId(`list-save`).click()
  await expect(pageTitle(page)).toHaveText(`${name} renamed`)
  expect(await readCalendar(calendarUrl)).toEqual({
    displayName: `${name} renamed`,
    color: `#3D405BFF`,
  })
})

test("deleting a list names its task count, asks first, and removes it from the server", async ({ page }) => {
  const list = await seedTaskList(`First errand`)
  created.push(list)
  await addSeededTask(list, `Second errand`)
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}/settings`)
  const name = `E2E ${slug}`
  await expect(page.getByTestId(`list-name`)).toHaveValue(name)

  await page.getByTestId(`list-menu`).click()
  await page.getByTestId(`list-delete`).click()
  const dialog = page.getByTestId(`list-delete-dialog`)
  await expect(dialog).toContainText(`Delete ${name} and its 2 tasks?`)
  await dialog.getByTestId(`confirm-dialog-cancel`).click()
  expect(await readCalendar(list.calendarUrl)).not.toBeNull()

  await page.getByTestId(`list-menu`).click()
  await page.getByTestId(`list-delete`).click()
  await page.getByTestId(`list-delete-dialog`).getByRole(`button`, { name: `Delete`, exact: true })
    .click()
  await expect(pageTitle(page)).toHaveText(`Lists`)
  await expect(page.getByRole(`button`, { name })).toHaveCount(0)
  expect(await readCalendar(list.calendarUrl)).toBeNull()
})
