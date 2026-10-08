import { expect, type Page, test } from "@playwright/test"
import { OWNER_PASSWORD } from "./env.ts"

/**
 * Gives this page's requests their own client address. The server believes X-Real-IP from a
 * loopback peer, as it would from Traefik, so each test counts its wrong passwords alone. The retry
 * number is part of the address, so a retried test does not start out locked.
 */
async function actAs(page: Page, address: string): Promise<void> {
  await page.route(
    `**/api/**`,
    (route) => route.continue({ headers: { ...route.request().headers(), "x-real-ip": address } }),
  )
}

/** Types the password, sends it and waits for the server's answer. */
async function submit(page: Page, password: string): Promise<void> {
  await page.getByLabel(`Password`).fill(password)
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/auth/sign-in`)),
    page.getByRole(`button`, { name: `Sign in` }).click(),
  ])
}

test(
  "a wrong password shows the error and puts the focus back on the field",
  async ({ page }, info) => {
    await actAs(page, `198.51.100.${10 + info.retry}`)
    await page.goto(`/`)
    await submit(page, `not the password`)
    await expect(page.getByRole(`alert`)).toHaveText(`Wrong password`)
    await expect(page.getByLabel(`Password`)).toBeFocused()
    await expect(page.getByLabel(`Password`)).toHaveAttribute(`aria-invalid`, `true`)
  },
)

test(
  "the right password opens the app in an HttpOnly, SameSite=Strict cookie that survives a reload, and sign-out ends it",
  async ({ page, context }, info) => {
    await actAs(page, `198.51.100.${20 + info.retry}`)
    await page.goto(`/`)
    await submit(page, OWNER_PASSWORD)
    await expect(page.getByTestId(`page-title`)).toHaveText(`Today`)

    const [cookie] = await context.cookies()
    expect(cookie).toMatchObject({
      name: `__Host-session`,
      path: `/`,
      httpOnly: true,
      secure: true,
      sameSite: `Strict`,
    })
    expect(await page.evaluate(() => document.cookie)).toBe(``)

    await page.reload()
    await expect(page.getByTestId(`page-title`)).toHaveText(`Today`)

    // The UI has no sign-out button yet, so the page calls the route the way the app will.
    const status = await page.evaluate(async () =>
      (await fetch(`/api/auth/sign-out`, { method: `POST` })).status
    )
    expect(status).toBe(204)
    await page.reload()
    await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  },
)

test(
  "after six wrong passwords even the right one is refused, with when to retry",
  async ({ page }, info) => {
    await actAs(page, `198.51.100.${30 + info.retry}`)
    await page.goto(`/`)
    const alert = page.getByRole(`alert`)
    for (let attempt = 1; attempt <= 6; attempt++) {
      await submit(page, `wrong ${attempt}`)
      await expect(alert).toHaveText(`Wrong password`)
    }
    await submit(page, OWNER_PASSWORD)
    await expect(alert).toHaveText(`Too many wrong passwords. Try again in 15 minutes.`)
    await expect(page.getByLabel(`Password`)).toBeFocused()
  },
)
