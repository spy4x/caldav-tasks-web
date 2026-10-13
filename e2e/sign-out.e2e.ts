import { expect, type Page, test } from "@playwright/test"
import { deleteList, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

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
  await expect(page.getByRole(`button`, { name: `Seeded errand`, exact: true })).toBeVisible()
}

/** Every record of every IndexedDB database of the page, as one JSON text. */
function stored(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const records: unknown[] = []
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      for (const store of db.objectStoreNames) {
        records.push(
          ...await new Promise<unknown[]>((resolve, reject) => {
            const request = db.transaction(store).objectStore(store).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          }),
        )
      }
      db.close()
    }
    return JSON.stringify(records)
  })
}

test(`signing out in Settings leaves no task in the browser's storage`, async ({ page }) => {
  await openList(page)
  expect(await stored(page)).toContain(`Seeded errand`)

  await page.goto(`/settings`)
  await page.getByRole(`button`, { name: `Sign out`, exact: true }).click()

  await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  // The tab no longer names the page the person signed out from.
  await expect(page).toHaveTitle(`Tasks`)
  await expect.poll(() => stored(page)).not.toContain(`Seeded errand`)
  expect(await page.evaluate(() => localStorage.getItem(`session:signed-in`))).toBeNull()
})

test(`signing out with a change that was not sent asks first, and a yes removes it from the browser`, async ({ page }) => {
  await openList(page)
  // The write gets no answer, so it waits in the queue while every other request works.
  await page.route(
    `**/api/caldav/objects`,
    (route) => route.request().method() === `POST` ? route.abort() : route.continue(),
  )
  await page.getByTestId(`quick-add-input`).fill(`Not sent yet`)
  await page.getByTestId(`quick-add-submit`).click()
  await expect(page.getByRole(`button`, { name: `Not sent yet`, exact: true })).toBeVisible()
  await expect.poll(() => stored(page)).toContain(`Not sent yet`)

  await page.goto(`/settings`)
  const signOut = page.getByRole(`button`, { name: `Sign out`, exact: true })
  await signOut.click()
  const question = page.getByRole(`alertdialog`, { name: `Sign out with unsent changes?` })
  await expect(question).toContainText(`1 change made on this device has not been sent`)

  await question.getByRole(`button`, { name: `Stay signed in` }).last().click()
  await expect(question).toHaveCount(0)
  await expect(page.getByRole(`heading`, { name: `Settings` })).toBeVisible()
  expect(await stored(page)).toContain(`Not sent yet`)

  await signOut.click()
  await question.getByRole(`button`, { name: `Sign out and lose unsent changes` }).click()

  await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  await expect.poll(() => stored(page)).not.toContain(`Not sent yet`)
})
