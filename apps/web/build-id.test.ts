import { expect } from "@std/expect"
import { buildIdOf } from "./build-id.ts"

const bytes = (text: string) => new TextEncoder().encode(text)

Deno.test(`the build id changes when a shipped file changes`, async () => {
  const before = await buildIdOf(new Map([[`/index.html`, bytes(`a`)]]))
  const after = await buildIdOf(new Map([[`/index.html`, bytes(`b`)]]))
  expect(before).not.toBe(after)
})

Deno.test(`the build id changes when a file is renamed`, async () => {
  const before = await buildIdOf(new Map([[`/a.js`, bytes(`x`)]]))
  const after = await buildIdOf(new Map([[`/b.js`, bytes(`x`)]]))
  expect(before).not.toBe(after)
})

Deno.test(`the build id is the same for the same files in any order`, async () => {
  const one = await buildIdOf(new Map([[`/a`, bytes(`1`)], [`/b`, bytes(`2`)]]))
  const two = await buildIdOf(new Map([[`/b`, bytes(`2`)], [`/a`, bytes(`1`)]]))
  expect(one).toBe(two)
})
