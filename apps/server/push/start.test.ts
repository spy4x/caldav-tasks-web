/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { checkPushState, createPushStore, PUSH_FILE, PushStateError } from "./start.ts"
import { memoryFileSystem } from "./testing.ts"

Deno.test("the start check passes on a usable data folder and leaves no file behind", async () => {
  const fs = memoryFileSystem()
  await checkPushState(fs, "/data/", createPushStore(fs, "/data/"))
  expect([...fs.files.keys()]).toEqual([])
})

Deno.test("the start check refuses a data folder that takes no new file, naming the error's class and no path", async () => {
  const fs = memoryFileSystem()
  fs.writeText = (path) => {
    const error = new Error(`open '${path}'`)
    error.name = "PermissionDenied"
    return Promise.reject(error)
  }
  const check = checkPushState(fs, "/data", createPushStore(fs, "/data"))
  await expect(check).rejects.toThrow(PushStateError)
  await expect(check).rejects.toThrow(/^DATA_DIR cannot be read and written \(PermissionDenied\)$/)
})

Deno.test("the start check refuses a damaged subscription file, naming the store's code", async () => {
  const fs = memoryFileSystem()
  fs.files.set(`/data/${PUSH_FILE}`, "{ not json")
  const check = checkPushState(fs, "/data", createPushStore(fs, "/data"))
  await expect(check).rejects.toThrow(
    /^push\.json cannot be used \(corrupt\); it was left as it is$/,
  )
  expect([...fs.files]).toEqual([[`/data/${PUSH_FILE}`, "{ not json"]])
})
