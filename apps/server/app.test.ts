/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import { createApp } from "./app.ts"
import { TEST_CONFIG, TEST_OWNER_PASSWORD } from "./test-config.ts"
import { AUTH_PATHS } from "@api/auth.ts"

const STATIC_ROOT = fromFileUrl(new URL("./testdata", import.meta.url))
const app = await createApp(TEST_CONFIG, { staticRoot: STATIC_ROOT })

Deno.test("answers /health with 200", async () => {
  const response = await app.request("/health")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: "ok" })
})

Deno.test("serves the SPA shell at /", async () => {
  const response = await app.request("/")
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/html")
  expect(await response.text()).toContain(`<div id="app">`)
})

Deno.test("serves the SPA shell for a deep link the router owns", async () => {
  const response = await app.request("/upcoming")
  expect(response.status).toBe(200)
  expect(await response.text()).toContain(`<div id="app">`)
})

Deno.test("serves a built asset as immutable and the shell as revalidated", async () => {
  const asset = await app.request("/assets/app-abc123.js")
  expect(asset.status).toBe(200)
  expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
  await asset.body?.cancel()
  const shell = await app.request("/")
  expect(shell.headers.get("cache-control")).toBe("no-cache")
  await shell.body?.cancel()
})

/** A session cookie for the test owner, as the browser would send it back. */
async function sessionCookie(): Promise<string> {
  const response = await app.request(AUTH_PATHS.signIn, {
    method: "POST",
    headers: {
      origin: TEST_CONFIG.PUBLIC_URL,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: TEST_OWNER_PASSWORD }),
  })
  expect(response.status).toBe(204)
  return (response.headers.get("set-cookie") ?? "").split(";")[0]
}

Deno.test("answers an unknown /api path with a JSON 401 without a session, not the SPA", async () => {
  const response = await app.request("/api/unknown")
  expect(response.status).toBe(401)
  expect(response.headers.get("content-type")).toContain("application/json")
  expect(await response.json()).toEqual({ code: "unauthorized", message: "Sign in first" })
})

Deno.test("answers an unknown /api path with a JSON 404 when signed in, not the SPA", async () => {
  const cookie = await sessionCookie()
  for (const path of ["/api/unknown", "/api/auth/nothing", "/api/caldav/nothing"]) {
    const response = await app.request(path, { headers: { cookie } })
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual({ code: "not_found", message: "Not found" })
  }
})

Deno.test("answers a missing built file under /assets/ with 404, not the shell", async () => {
  const response = await app.request("/assets/gone-123.js")
  expect(response.status).toBe(404)
  expect(response.headers.get("content-type") ?? "").not.toContain("text/html")
  expect(response.headers.get("cache-control") ?? "").not.toContain("immutable")
  expect(await response.text()).not.toContain(`<div id="app">`)
})

Deno.test("sends security headers on pages, assets, health and errors", async () => {
  for (const path of ["/", "/assets/app-abc123.js", "/health", "/assets/gone-123.js"]) {
    const response = await app.request(path)
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    await response.body?.cancel()
  }
})

Deno.test("the policy allows the shell's inline script and style by hash, not unsafe-inline", async () => {
  const response = await app.request("/")
  const csp = response.headers.get("content-security-policy") ?? ""
  await response.body?.cancel()
  // The two inline blocks in testdata/index.html, hashed here without the server's helper.
  const bodies = [
    `\nbody {\n  margin: 0;\n}\n`,
    `\ndocument.documentElement.dataset.ready = "1"\n`,
  ]
  for (const body of bodies) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
    )
    expect(csp).toContain(`'sha256-${btoa(String.fromCharCode(...digest))}'`)
  }
  expect(csp).not.toContain("unsafe-inline")
  expect(csp).not.toContain("unsafe-eval")
})
