/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { installOfflineShell, type ShellScope } from "@spy4x/platform/browser/offline-shell"
import { shellOptions } from "./sw-options.ts"

type Handler = (event: Record<string, unknown>) => void

/** A worker scope over in-memory caches and a fake network; returns what the worker did. */
function fakeWorker(
  buildId: string,
  existingCaches: string[],
  network: (path: string) => Response,
) {
  const handlers = new Map<string, Handler>()
  const caches = new Map<string, Map<string, Response>>(existingCaches.map((n) => [n, new Map()]))
  const path = (input: Request | string) =>
    new URL(typeof input === `string` ? input : input.url, `https://app.example`).pathname
  const open = (name: string) => {
    if (!caches.has(name)) caches.set(name, new Map())
    const store = caches.get(name)!
    return Promise.resolve({
      match: (input: Request | string) => Promise.resolve(store.get(path(input))?.clone()),
      put: (input: Request | string, response: Response) => {
        store.set(path(input), response)
        return Promise.resolve()
      },
      add: (input: Request | string) => {
        store.set(path(input), network(path(input)))
        return Promise.resolve()
      },
    })
  }
  const scope: ShellScope = {
    location: { origin: `https://app.example` },
    navigator: { onLine: true },
    caches: {
      open,
      keys: () => Promise.resolve([...caches.keys()]),
      delete: (name) => Promise.resolve(caches.delete(name)),
    },
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
    fetch: (input) => Promise.resolve(network(path(input))),
    addEventListener: (type, listener) => handlers.set(type, listener),
  }
  installOfflineShell(scope, shellOptions(buildId))

  const run = async (type: string) => {
    let waiting: Promise<unknown> = Promise.resolve()
    handlers.get(type)!({ waitUntil: (p: Promise<unknown>) => (waiting = p) })
    await waiting
  }
  const request = async (url: string, mode?: RequestMode) => {
    let answer: Promise<Response> | undefined
    const pending: Promise<unknown>[] = []
    handlers.get(`fetch`)!({
      request: new Request(url, mode ? { mode } : undefined),
      respondWith: (p: Promise<Response>) => (answer = p),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    })
    const response = await answer
    await Promise.all(pending)
    return response
  }
  return { caches, run, request }
}

const page =
  `<link rel="manifest" href="/manifest.webmanifest"><script src="/assets/a.js"></script>`
const site = (path: string) =>
  path === `/`
    ? new Response(page, { headers: { "content-type": `text/html` } })
    : new Response(`ok`)

Deno.test(`a new deploy deletes the cache of the old one when its worker activates`, async () => {
  const worker = fakeWorker(`new1`, [`shell-old1`, `shell-older`, `other-cache`], site)
  await worker.run(`install`)
  await worker.run(`activate`)
  expect([...worker.caches.keys()].sort()).toEqual([`other-cache`, `shell-new1`])
})

Deno.test(`the worker stores the page with the files it links to, the manifest included`, async () => {
  const worker = fakeWorker(`b1`, [], site)
  await worker.run(`install`)
  expect([...worker.caches.get(`shell-b1`)!.keys()].sort()).toEqual([
    `/`,
    `/assets/a.js`,
    `/manifest.webmanifest`,
  ])
})

Deno.test(`the worker never answers or stores a request under /api`, async () => {
  const worker = fakeWorker(`b1`, [], site)
  await worker.run(`install`)
  expect(await worker.request(`https://app.example/api/caldav/lists`)).toBeUndefined()
  expect([...worker.caches.get(`shell-b1`)!.keys()].some((k) => k.startsWith(`/api`))).toBe(false)
})

Deno.test(`a missing asset stays a 404 and is not stored`, async () => {
  const worker = fakeWorker(
    `b1`,
    [],
    (path) => path.startsWith(`/assets/gone`) ? new Response(`no`, { status: 404 }) : site(path),
  )
  await worker.run(`install`)
  const response = await worker.request(`https://app.example/assets/gone.js`)
  expect(response?.status).toBe(404)
  expect(worker.caches.get(`shell-b1`)!.has(`/assets/gone.js`)).toBe(false)
})

Deno.test(`two builds get two cache names, so a deploy cannot reuse the old cache`, () => {
  expect(shellOptions(`build-a`).cacheName).not.toBe(shellOptions(`build-b`).cacheName)
})
