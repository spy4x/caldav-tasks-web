import { expect, type Page, test } from "@playwright/test"
import {
  addSeededTask,
  deleteList,
  readTask,
  type SeededList,
  seedTaskList,
} from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

let list: SeededList
let urls: Record<string, string>

const sortOrderOf = async (name: string) =>
  Number((await readTask(urls[name])).match(/X-APPLE-SORT-ORDER:(-?\d+)/)?.[1])

test.beforeEach(async () => {
  // The seeded task has no position, so it sits after the three below.
  list = await seedTaskList(`Seeded errand`, [])
  urls = {
    First: await addSeededTask(list, `First`, [`X-APPLE-SORT-ORDER:100`]),
    Second: await addSeededTask(list, `Second`, [`X-APPLE-SORT-ORDER:200`]),
    Third: await addSeededTask(list, `Third`, [`X-APPLE-SORT-ORDER:300`]),
  }
})

test.afterEach(async () => await deleteList(list))

async function openList(page: Page) {
  await signIn(page)
  const slug = new URL(list.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
  await page.goto(`/lists/${encodeURIComponent(slug)}`)
  await expect(page.getByRole(`button`, { name: `First`, exact: true })).toBeVisible()
}

const shown = (page: Page) => page.getByTestId(`task-open`).allTextContents()

test("moving a task with the keyboard writes only that task and survives a reload", async ({ page }) => {
  await openList(page)
  expect((await shown(page)).slice(0, 3)).toEqual([`First`, `Second`, `Third`])
  const before = { First: await readTask(urls.First), Second: await readTask(urls.Second) }

  const handle = page.getByRole(`button`, { name: `Reorder Third` })
  await handle.focus()
  await page.keyboard.press(`Space`)
  await page.keyboard.press(`ArrowUp`)
  await page.keyboard.press(`ArrowUp`)
  await page.keyboard.press(`Space`)

  await expect.poll(async () => (await shown(page)).slice(0, 3)).toEqual([
    `Third`,
    `First`,
    `Second`,
  ])
  await expect.poll(() => sortOrderOf(`Third`)).toBeLessThan(100)
  expect(await readTask(urls.First)).toBe(before.First)
  expect(await readTask(urls.Second)).toBe(before.Second)

  await page.reload()
  await expect(page.getByRole(`button`, { name: `First`, exact: true })).toBeVisible()
  expect((await shown(page)).slice(0, 3)).toEqual([`Third`, `First`, `Second`])
})

test("dragging a handle with the mouse moves the task below the next one", async ({ page }) => {
  await openList(page)
  const handle = page.getByRole(`button`, { name: `Reorder First` })
  const target = page.getByRole(`button`, { name: `Reorder Second` })
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, { steps: 10 })
  await page.mouse.up()

  await expect.poll(async () => (await shown(page)).slice(0, 3)).toEqual([
    `Second`,
    `First`,
    `Third`,
  ])
  await expect.poll(() => sortOrderOf(`First`)).toBeGreaterThan(200)
})

test("a list in another sort order has no drag handles", async ({ page }) => {
  await openList(page)
  await expect(page.getByRole(`button`, { name: `Reorder First` })).toBeVisible()
  await page.getByTestId(`sort`).selectOption({ label: `Title` })
  await expect(page.getByRole(`button`, { name: /^Reorder / })).toHaveCount(0)
})
