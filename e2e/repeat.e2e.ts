import { expect, test } from "@playwright/test"
import { deleteList, readTask, type SeededList, seedTaskList } from "./fixtures/radicale.ts"
import { signIn } from "./sign-in.ts"

let list: SeededList

test.beforeEach(async () => {
  list = await seedTaskList(`Seeded errand`, [`DUE;VALUE=DATE:20200101`])
})

test.afterEach(async () => await deleteList(list))

test("a repeat on Monday and Thursday, ten times, survives a reload and is written for Tasks.org", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page)
  await page.getByRole(`button`, { name: `Seeded errand`, exact: true }).click()

  await page.getByLabel(`Repeat`, { exact: true }).selectOption({ label: `Weekly` })
  const days = page.getByRole(`group`, { name: `Days of the week` })
  await days.getByRole(`button`, { name: `Thu` }).click()
  await days.getByRole(`button`, { name: `Mon` }).click()
  await page.getByLabel(`Ends`).selectOption({ label: `After a number of times` })
  await page.getByLabel(`Times`).fill(`10`)
  await expect(days.getByRole(`button`, { pressed: true })).toHaveText([`Mon`, `Thu`])
  // Days, end and count fit a phone: nothing makes the page scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth))
    .toBe(true)
  await page.getByTestId(`task-save`).click()
  await expect(page).toHaveURL(/\/lists\//)

  await expect.poll(async () => await readTask(list.taskUrl)).toContain(
    `RRULE:FREQ=WEEKLY;COUNT=10;INTERVAL=1;BYDAY=MO,TH`,
  )

  await page.reload()
  await page.getByRole(`button`, { name: `Seeded errand`, exact: true }).click()
  await expect(page.getByLabel(`Repeat`, { exact: true })).toHaveValue(`2`)
  await expect(
    page.getByRole(`group`, { name: `Days of the week` }).getByRole(`button`, {
      pressed: true,
    }),
  ).toHaveText([`Mon`, `Thu`])
  await expect(page.getByLabel(`Ends`)).toHaveValue(`count`)
  await expect(page.getByLabel(`Times`)).toHaveValue(`10`)

  // The end moves to a date: the count goes, the days stay, and the day buttons work from the keyboard.
  await page.getByLabel(`Ends`).selectOption({ label: `On a date` })
  await page.getByLabel(`End date`).fill(`2030-12-01`)
  await page.getByRole(`group`, { name: `Days of the week` }).getByRole(`button`, { name: `Fri` })
    .focus()
  await page.keyboard.press(`Space`)
  await page.getByTestId(`task-save`).click()
  await expect(page).toHaveURL(/\/lists\//)
  await expect.poll(async () => await readTask(list.taskUrl)).toContain(
    `RRULE:FREQ=WEEKLY;UNTIL=20301201;INTERVAL=1;BYDAY=MO,TH,FR`,
  )
  expect(await readTask(list.taskUrl)).not.toContain(`COUNT`)
})

test("an end that is chosen but left empty stops the save with the browser's message", async ({ page }) => {
  await signIn(page)
  await page.getByRole(`button`, { name: `Seeded errand`, exact: true }).click()
  await page.getByLabel(`Repeat`, { exact: true }).selectOption({ label: `Daily` })
  await page.getByLabel(`Ends`).selectOption({ label: `On a date` })
  await page.getByTestId(`task-save`).click()
  await expect(page.getByLabel(`End date`)).toHaveJSProperty(`validity.valueMissing`, true)
  await expect(page).not.toHaveURL(/\/lists\//)
  expect(await readTask(list.taskUrl)).not.toContain(`RRULE`)

  await page.getByLabel(`Ends`).selectOption({ label: `After a number of times` })
  await page.getByTestId(`task-save`).click()
  await expect(page.getByLabel(`Times`)).toHaveJSProperty(`validity.valueMissing`, true)
  await expect(page).not.toHaveURL(/\/lists\//)
})
