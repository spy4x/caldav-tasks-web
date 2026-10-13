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

test.describe("a person far ahead of UTC", () => {
  // Kiritimati is 14 hours ahead of UTC, so for most of the day its date is not the server's.
  const ZONE = `Pacific/Kiritimati`
  test.use({ timezoneId: ZONE })

  /** `YYYY-MM-DD` of the day `days` away from today as the person's zone reads it. */
  function dayFromToday(days: number): string {
    const today = new Intl.DateTimeFormat(`en-CA`, { timeZone: ZONE }).format(new Date())
    const moved = new Date(`${today}T00:00:00Z`)
    moved.setUTCDate(moved.getUTCDate() + days)
    return moved.toISOString().slice(0, 10)
  }

  test("a weekly task set to count from completion, completed three days late, is due a week from today", async ({ page }) => {
    const late = await seedTaskList(`Water the ferns`, [
      `DUE;VALUE=DATE:${dayFromToday(-3).replaceAll(`-`, ``)}`,
    ])
    try {
      await signIn(page)
      const slug = new URL(late.calendarUrl).pathname.split(`/`).filter(Boolean).at(-1)!
      await page.goto(`/lists/${encodeURIComponent(slug)}`)
      const row = page.getByRole(`button`, { name: `Water the ferns`, exact: true })
      await row.click()

      // The choice appears with the repeat, and works from the keyboard like any radio group.
      const choice = page.getByRole(`group`, { name: `Count the next date` })
      await expect(choice).toHaveCount(0)
      await page.getByLabel(`Repeat`, { exact: true }).selectOption({ label: `Weekly` })
      await expect(choice.getByRole(`radio`, { name: `From the due date` })).toBeChecked()
      await choice.getByRole(`radio`, { name: `From the due date` }).focus()
      await page.keyboard.press(`ArrowDown`)
      const fromCompletion = choice.getByRole(`radio`, { name: `From the day it is completed` })
      await expect(fromCompletion).toBeChecked()
      await expect(fromCompletion).toBeFocused()
      await page.getByTestId(`task-save`).click()
      await expect(page).toHaveURL(/\/lists\//)
      await expect.poll(async () => await readTask(late.taskUrl)).toContain(
        `X-REPEAT-FROM:COMPLETION`,
      )

      await page.getByRole(`checkbox`, { name: /Water the ferns/ }).click()
      const next = dayFromToday(7)
      await expect.poll(async () => await readTask(late.taskUrl)).toContain(
        `DUE;VALUE=DATE:${next.replaceAll(`-`, ``)}`,
      )
      const onServer = await readTask(late.taskUrl)
      expect(onServer).toContain(`X-REPEAT-FROM:COMPLETION`)
      expect(onServer).not.toContain(`STATUS:COMPLETED`)

      // The task stays open in the list with the new date, at once and after a reload.
      await row.click()
      await expect(page.getByTestId(`task-due-date`)).toHaveValue(next)
      await page.reload()
      await expect(page.getByTestId(`task-due-date`)).toHaveValue(next)
      await expect(fromCompletion).toBeChecked()
    } finally {
      await deleteList(late)
    }
  })
})
