/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { createPasswordHasher } from "@spy4x/server/sign-in"
import { eraseLastCharacter, hashPassword, passwordFromInput } from "./password-hash.ts"

const PEPPER = "test-pepper-test-pepper-test-pepper"

Deno.test("piped input loses one trailing line break and nothing else", () => {
  expect(passwordFromInput("secret\n")).toBe("secret")
  expect(passwordFromInput("secret\r\n")).toBe("secret")
  expect(passwordFromInput("secret")).toBe("secret")
  expect(passwordFromInput(" secret \n\n")).toBe(" secret \n")
})

Deno.test("the printed hash verifies the password under the same pepper only", async () => {
  const hash = await hashPassword("correct horse", PEPPER)
  const hasher = createPasswordHasher({ pepper: PEPPER })
  expect((await hasher.verify("correct horse", hash)).valid).toBe(true)
  expect((await hasher.verify("correct horsf", hash)).valid).toBe(false)
  const otherPepper = createPasswordHasher({ pepper: `${PEPPER}-other` })
  expect((await otherPepper.verify("correct horse", hash)).valid).toBe(false)
})

Deno.test("Backspace removes the whole last character, however many bytes it takes", () => {
  const typed = (text: string) => [...new TextEncoder().encode(text)]
  const decode = (bytes: number[]) => new TextDecoder().decode(new Uint8Array(bytes))
  for (
    const [text, left] of [["pass", "pas"], ["paß", "pa"], ["pa€", "pa"], ["pa🔑", "pa"], ["", ""]]
  ) {
    const bytes = typed(text)
    eraseLastCharacter(bytes)
    expect(decode(bytes)).toBe(left)
  }
})
