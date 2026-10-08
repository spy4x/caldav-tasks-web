/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { createApp } from "./app.ts"
import { TEST_CONFIG } from "./test-config.ts"

const STATIC_ROOT = new URL("./testdata", import.meta.url).pathname
const app = createApp(TEST_CONFIG, { staticRoot: STATIC_ROOT })

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

Deno.test("answers an unknown /api path with a JSON 404, not the SPA", async () => {
  const response = await app.request("/api/unknown")
  expect(response.status).toBe(404)
  expect(response.headers.get("content-type")).toContain("application/json")
  expect(await response.json()).toEqual({ code: "not_found", message: "Not found" })
})
