import { expect, type Page, test } from "@playwright/test"
import { deleteList, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { pageTitle, signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Guarded errand`, [`DUE;VALUE=DATE:20200101`])
})

test.afterEach(async () => await deleteList(list))

/** Opens the seeded task in the editor and returns its title field. */
async function openEditor(page: Page) {
  await signIn(page)
  await page.getByRole(`button`, { name: `Guarded errand`, exact: true }).click()
  await expect(page).toHaveURL(/\/tasks\//)
  const title = page.getByTestId(`task-title`)
  await expect(title).toBeVisible()
  return title
}

/** Types an unsaved change, then moves the focus off the field so the shortcuts listen again. */
async function editTitle(page: Page, text: string) {
  const title = page.getByTestId(`task-title`)
  await title.fill(text)
  await page.getByRole(`heading`, { level: 1 }).first().click()
  return title
}

const question = (page: Page) => page.getByRole(`alertdialog`, { name: `Leave without saving?` })

interface Way {
  name: string
  go: (page: Page) => Promise<void>
  title: string
  /** The `data-e2e` of the field the shortcut must leave focused. */
  field?: string
}

for (
  const way of <Way[]> [
    {
      name: `a sidebar button`,
      go: (page) => page.getByRole(`button`, { name: `Lists`, exact: true }).click(),
      title: `Lists`,
    },
    {
      name: `g t`,
      go: async (page) => {
        await page.keyboard.press(`g`)
        await page.keyboard.press(`t`)
      },
      title: `Today`,
    },
    {
      name: `g l`,
      go: async (page) => {
        await page.keyboard.press(`g`)
        await page.keyboard.press(`l`)
      },
      title: `Lists`,
    },
    {
      name: `g u`,
      go: async (page) => {
        await page.keyboard.press(`g`)
        await page.keyboard.press(`u`)
      },
      title: `Upcoming`,
    },
    {
      name: `n`,
      go: (page) => page.keyboard.press(`n`),
      title: `Today`,
      field: `quick-add-input`,
    },
    {
      name: `/`,
      go: (page) => page.keyboard.press(`/`),
      title: `Search`,
      field: `search-input`,
    },
  ]
) {
  test(`${way.name} asks before leaving the editor with unsaved changes: Stay keeps the text, Leave goes`, async ({ page }) => {
    await openEditor(page)
    const title = await editTitle(page, `Changed but not saved`)

    await way.go(page)
    await expect(question(page)).toBeVisible()
    await question(page).getByTestId(`confirm-dialog-cancel`).click()
    await expect(question(page)).toBeHidden()
    await expect(page).toHaveURL(/\/tasks\//)
    await expect(title).toHaveValue(`Changed but not saved`)

    await way.go(page)
    await question(page).getByRole(`button`, { name: `Leave` }).click()
    await expect(page).not.toHaveURL(/\/tasks\//)
    await expect(pageTitle(page)).toHaveText(way.title)
    // The shortcut exists to put the cursor in its field: the next letters belong there.
    if (way.field) await expect(page.getByTestId(way.field)).toBeFocused()
  })

  test(`${way.name} leaves the editor at once when nothing is unsaved`, async ({ page }) => {
    await openEditor(page)
    await page.getByRole(`heading`, { level: 1 }).first().click()
    await way.go(page)
    await expect(page).not.toHaveURL(/\/tasks\//)
    await expect(question(page)).toBeHidden()
    await expect(pageTitle(page)).toHaveText(way.title)
  })
}

test(`Cancel, a link, asks before leaving with unsaved changes: Stay keeps the text, Leave goes back`, async ({ page }) => {
  await openEditor(page)
  const title = await editTitle(page, `Changed but not saved`)

  await page.getByTestId(`task-cancel`).click()
  await expect(question(page)).toBeVisible()
  await question(page).getByTestId(`confirm-dialog-cancel`).click()
  await expect(page).toHaveURL(/\/tasks\//)
  await expect(title).toHaveValue(`Changed but not saved`)

  await page.getByTestId(`task-cancel`).click()
  await question(page).getByRole(`button`, { name: `Leave` }).click()
  await expect(page).not.toHaveURL(/\/tasks\//)
})

test(`Cancel leaves the editor at once when nothing is unsaved`, async ({ page }) => {
  await openEditor(page)
  await page.getByTestId(`task-cancel`).click()
  await expect(page).not.toHaveURL(/\/tasks\//)
  await expect(question(page)).toBeHidden()
})

test(`a shortcut pressed while the question is open does not change where Leave goes`, async ({ page }) => {
  await openEditor(page)
  await editTitle(page, `Changed but not saved`)

  await page.getByRole(`button`, { name: `Lists`, exact: true }).click()
  await expect(question(page)).toBeVisible()
  await page.keyboard.press(`g`)
  await page.keyboard.press(`u`)
  await expect(question(page)).toBeVisible()
  await question(page).getByRole(`button`, { name: `Leave` }).click()
  await expect(pageTitle(page)).toHaveText(`Lists`)
})
