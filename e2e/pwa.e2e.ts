import { expect, type Page, test } from "@playwright/test"
import { pageTitle, signIn, underWorker } from "./sign-in.ts"

/** The key `apps/web/src/state/session.ts` keeps its "signed in on this device" hint under. */
const SIGNED_IN_HINT_KEY = `session:signed-in`

const hint = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SIGNED_IN_HINT_KEY)

/** Every URL stored in every cache of the page's origin. */
function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
    }
    return urls
  })
}

test(`serves a manifest whose icons exist and include a maskable one`, async ({ page, request }) => {
  await signIn(page)
  await page.goto(`/`)
  const href = await page.locator(`link[rel=manifest]`).getAttribute(`href`)
  const response = await request.get(href!)
  expect(response.headers()[`content-type`]).toContain(`application/manifest+json`)
  const manifest = await response.json()
  expect(manifest.display).toBe(`standalone`)
  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose)
  expect(purposes).toContain(`maskable`)
  expect(purposes).toContain(`any`)
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200)
  }
})

test(`registers the worker under the content security policy without a violation`, async ({ page }) => {
  await signIn(page)
  const problems: string[] = []
  page.on(`console`, (message) => {
    if (message.type() === `error`) problems.push(message.text())
  })
  page.on(`pageerror`, (error) => problems.push(error.message))
  await page.goto(`/`)
  await underWorker(page)
  await expect(pageTitle(page)).toHaveText(`Today`)
  expect(problems).toEqual([])
})

test(`stores the shell and never an /api URL`, async ({ page }) => {
  await signIn(page)
  await page.goto(`/`)
  await underWorker(page)
  // Under the worker, a request to /api or /health must go to the network, not through the worker.
  for (const path of [`/api/caldav/lists`, `/health`]) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === path),
      page.evaluate((url) => fetch(url).catch(() => undefined), path),
    ])
    expect(response.fromServiceWorker(), path).toBe(false)
  }
  const paths = (await cachedUrls(page)).map((url) => new URL(url).pathname)
  expect(paths).toContain(`/`)
  expect(paths.some((path) => path.startsWith(`/assets/`))).toBe(true)
  expect(paths).toContain(`/manifest.webmanifest`)
  expect(paths.filter((path) => path.startsWith(`/api`) || path === `/health`)).toEqual([])
})

test(`a signed-in owner who goes offline and reloads sees the last view, not sign-in`, async ({ page, context }) => {
  await signIn(page)
  await page.goto(`/lists`)
  await underWorker(page)
  await context.setOffline(true)
  await page.reload()
  await expect(pageTitle(page)).toHaveText(`Lists`)
  await expect(page.getByRole(`heading`, { name: `Sign in` })).toHaveCount(0)
})

test(`a visitor who never signed in sees the sign-in screen offline`, async ({ page, context }) => {
  await page.goto(`/lists`)
  await underWorker(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  await expect(pageTitle(page)).toHaveCount(0)
})

test(`a 401 online clears the hint, so the next offline start shows sign-in`, async ({ page, context }) => {
  await signIn(page)
  await page.goto(`/lists`)
  await underWorker(page)
  expect(await hint(page)).toBe(`1`)
  // The session ends on the server's side: the next session request answers 401.
  await context.clearCookies()
  await page.reload()
  await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  expect(await hint(page)).toBeNull()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole(`heading`, { name: `Sign in` })).toBeVisible()
  await expect(pageTitle(page)).toHaveCount(0)
})

test(`opens a page offline after a non-page file was opened first`, async ({ page, context }) => {
  await signIn(page)
  await page.goto(`/`)
  await underWorker(page)
  // A file opened as a page (not an HTML one) must not replace the stored page.
  await page.goto(`/icons/icon.svg`)
  await context.setOffline(true)
  await page.goto(`/lists`)
  await expect(pageTitle(page)).toHaveText(`Lists`)
})

test(`a missing built file is still a 404 under the worker`, async ({ page }) => {
  await signIn(page)
  await page.goto(`/`)
  await underWorker(page)
  const status = await page.evaluate(async () => (await fetch(`/assets/missing-0000.js`)).status)
  expect(status).toBe(404)
})

test(`a worker that installs drops the cache of an older deploy`, async ({ page }) => {
  await signIn(page)
  await page.goto(`/`)
  await underWorker(page)
  // A second registration (another scope, same script) runs the real install and activate; the
  // stale cache stands for the one an older deploy left behind.
  const names = await page.evaluate(async () => {
    await (await caches.open(`shell-stale-deploy`)).put(`/`, new Response(`old`))
    const registration = await navigator.serviceWorker.register(`/sw.js`, { scope: `/other/` })
    const worker = registration.installing ?? registration.waiting ?? registration.active!
    await new Promise<void>((resolve) => {
      if (worker.state === `activated`) return resolve()
      worker.addEventListener(`statechange`, () => worker.state === `activated` && resolve())
    })
    return await caches.keys()
  })
  expect(names.filter((name) => name.startsWith(`shell-`))).toHaveLength(1)
  expect(names).not.toContain(`shell-stale-deploy`)
})
