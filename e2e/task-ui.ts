import type { Page } from "@playwright/test"

/**
 * Opens a task's editor from its row. On a list page pressing the title renames the task in place,
 * so the row's Edit button (shown on hover) opens it; a row without one opens from its title.
 */
export async function openTask(page: Page, title: string): Promise<void> {
  const row = page.getByRole(`button`, { name: title, exact: true })
  await row.hover()
  const edit = page.getByRole(`button`, { name: `Edit ${title}`, exact: true })
  if (await edit.count()) await edit.click()
  else await row.click()
}

/** Adds a task from the desktop sidebar's New task form, into the list on screen. */
export async function addTask(page: Page, text: string): Promise<void> {
  await page.getByTestId(`new-task-title`).fill(text)
  await page.getByTestId(`new-task-add`).click()
}

/** Opens the editor's "More options" (start date, tags, repeat), folded away until then. */
export async function moreOptions(page: Page): Promise<void> {
  const more = page.locator(`details`, {
    has: page.locator(`summary`, { hasText: `More options` }),
  })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await more.locator(`summary`).click()
  }
}

/** A link in the desktop sidebar. */
export function sidebarLink(page: Page, name: string) {
  return page.getByTestId(`sidebar`).getByRole(`link`, { name, exact: true })
}
