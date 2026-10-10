import { AxeBuilder } from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"
import { signIn } from "./sign-in.ts"

const SUBSCRIPTION = `/api/push/subscription`

/** The Notifications block of Settings and its buttons. */
function notifications(page: Page) {
  const block = page.getByRole(`group`, { name: `Notifications` })
  return {
    block,
    turnOn: block.getByRole(`button`, { name: `Turn on notifications` }),
    turnOff: block.getByRole(`button`, { name: `Turn off notifications` }),
    statusIs: (status: string) => expect(block).toHaveAttribute(`data-push-status`, status),
    /** Fails when axe finds a violation inside the block. */
    axe: async () => {
      const { violations } = await new AxeBuilder({ page }).include(`[data-push-status]`).analyze()
      expect(violations.map(({ id }) => id)).toEqual([])
    },
  }
}

/** Runs one push route from the page, so the request is same-origin with the session cookie. */
function call(page: Page, method: string, path: string, body?: unknown): Promise<number> {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": `application/json` }, body: JSON.stringify(body) }),
    })
    return response.status
  }, { method, path, body })
}

/** The name the server knows a device by: the SHA-256 of its endpoint, in hex. */
function deviceId(page: Page, endpoint: string): Promise<string> {
  return page.evaluate(async (endpoint) => {
    const digest = await crypto.subtle.digest(`SHA-256`, new TextEncoder().encode(endpoint))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, `0`)).join(``)
  }, endpoint)
}

/**
 * Whether the server under test has `endpoint` in its subscriptions file. `e2e/server.ts` gives
 * each start its own `data/e2e-*` folder; a server started any other way has none, which fails
 * the test instead of passing it unread.
 */
async function isStored(endpoint: string): Promise<boolean> {
  const files: string[] = []
  for await (const entry of Deno.readDir(`data`)) {
    if (entry.isDirectory && entry.name.startsWith(`e2e-`)) {
      files.push(`data/${entry.name}/push.json`)
    }
  }
  expect(files.length, `start the server with e2e/server.ts`).toBeGreaterThan(0)
  for (const file of files) {
    const text = await Deno.readTextFile(file).catch(() => ``)
    if (text.includes(endpoint)) return true
  }
  return false
}

// The default headless shell denies notifications whatever the context grants; full Chromium
// honours the grant.
test.use({ channel: `chromium`, permissions: [`notifications`] })

test(`Settings shows the Notifications block, off and ready to turn on, with no accessibility violation`, async ({ page }) => {
  await signIn(page)
  await page.goto(`/settings`)
  const push = notifications(page)
  await push.statusIs(`off`)
  await expect(push.turnOn).toBeVisible()
  await push.axe()
})

// Chromium for Testing has no push service, so `pushManager.subscribe` is refused and this is as
// far as a browser test gets: the permission is granted, the press reaches the browser, and the
// refusal is shown instead of a false "on". The day Chromium can subscribe, this test fails and
// should become "turning on saves the subscription, turning off removes it".
test(`turning on when the browser cannot subscribe says it failed, stays off and saves nothing`, async ({ page }) => {
  await signIn(page)
  await page.goto(`/settings`)
  const push = notifications(page)
  await push.statusIs(`off`)
  expect(await page.evaluate(() => Notification.permission)).toBe(`granted`)
  const saves: string[] = []
  page.on(`request`, (request) => {
    if (new URL(request.url()).pathname === SUBSCRIPTION) saves.push(request.method())
  })
  await push.turnOn.click()
  await expect(push.block.locator(`[data-push-message="enable"]`)).toBeVisible()
  await push.statusIs(`off`)
  await expect(push.turnOn).toBeFocused()
  await push.axe()
  expect(saves).toEqual([])
})

test(`the server gives its push key, stores a device's subscription once and forgets it when asked`, async ({ page }) => {
  await signIn(page)
  const key = await page.evaluate(async () =>
    (await (await fetch(`/api/push/key`)).json()).publicKey
  )
  // An uncompressed P-256 point, base64url: what `pushManager.subscribe` takes.
  expect(key).toMatch(/^B[A-Za-z0-9_-]{86}$/)

  // A public address, because the server refuses a private or a documentation one (192.0.2.1).
  // The server's reminder runner is live, so it would be contacted if a reminder came due in the
  // moment it is stored; the address is removed below.
  const endpoint = `https://8.8.8.8/push/e2e-${Date.now()}`
  const body = {
    deviceId: await deviceId(page, endpoint),
    subscription: {
      endpoint,
      expirationTime: null,
      keys: { auth: `auth-key`, p256dh: `p256dh-key` },
    },
  }
  expect(await call(page, `PUT`, SUBSCRIPTION, body)).toBe(204)
  expect(await isStored(endpoint)).toBe(true)
  // Saving the same device again, as every page load does, is not an error.
  expect(await call(page, `PUT`, SUBSCRIPTION, body)).toBe(204)

  expect(await call(page, `DELETE`, SUBSCRIPTION, { deviceId: body.deviceId })).toBe(204)
  expect(await isStored(endpoint)).toBe(false)
  // With no device left there is nobody to send a test to.
  expect(await call(page, `POST`, `/api/push/test`)).toBe(409)
})

test(`the server refuses a subscription whose push address is loopback, private or not https`, async ({ page }) => {
  await signIn(page)
  for (
    const endpoint of [`https://127.0.0.1/push`, `https://192.168.1.10/push`, `http://8.8.8.8/push`]
  ) {
    const body = {
      deviceId: await deviceId(page, endpoint),
      subscription: {
        endpoint,
        expirationTime: null,
        keys: { auth: `auth-key`, p256dh: `p256dh-key` },
      },
    }
    expect(await call(page, `PUT`, SUBSCRIPTION, body), endpoint).toBe(400)
    expect(await isStored(endpoint), endpoint).toBe(false)
  }
})
