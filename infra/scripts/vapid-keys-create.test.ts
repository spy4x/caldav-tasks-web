/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { generateVapidKeyPair, vapidPublicKey } from "@spy4x/integrations/push"
import { vapidKeysFromText } from "../../apps/server/push/keys.ts"
import { hasVapidKeys, isContact, vapidEnvLines, withVapidLines } from "./vapid-keys-create.ts"

Deno.test("writes three lines the server reads back as the same key pair", async () => {
  const pair = await generateVapidKeyPair()
  const lines = vapidEnvLines(pair, "mailto:me@example.com")
  expect(lines.map((line) => line.split("=")[0])).toEqual([
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ])
  const value = (index: number) => lines[index].slice(lines[index].indexOf("=") + 1)
  expect(value(2)).toBe("mailto:me@example.com")
  const keys = await vapidKeysFromText(value(0), value(1))
  expect(await vapidPublicKey(keys)).toBe(pair.publicKey)
})

Deno.test("accepts only a mailto: or https: contact", () => {
  expect(isContact("mailto:me@example.com")).toBe(true)
  expect(isContact("https://example.com/contact")).toBe(true)
  for (const text of ["me@example.com", "http://example.com", "mailto:", ""]) {
    expect([text, isContact(text)]).toEqual([text, false])
  }
})

Deno.test("adds the lines to .env text and replaces the ones already there, keeping the rest", () => {
  const lines = ["VAPID_PUBLIC_KEY=new-public", "VAPID_PRIVATE_KEY=new-private", "VAPID_SUBJECT=s"]
  expect(withVapidLines("", lines)).toBe(`${lines.join("\n")}\n`)
  expect(withVapidLines("PUBLIC_URL=http://localhost:5173\n", lines)).toBe(
    `PUBLIC_URL=http://localhost:5173\n\n${lines.join("\n")}\n`,
  )
  const replaced = withVapidLines(
    "VAPID_PUBLIC_KEY=old-public\nDATA_DIR=data\nVAPID_PRIVATE_KEY=old-private\n",
    lines,
  )
  expect(replaced).toBe(`DATA_DIR=data\n\n${lines.join("\n")}\n`)
})

Deno.test("sees keys that .env already holds, and not blank ones", () => {
  expect(hasVapidKeys("VAPID_PUBLIC_KEY=abc\n")).toBe(true)
  expect(hasVapidKeys("A=1\nVAPID_PRIVATE_KEY=abc\n")).toBe(true)
  expect(hasVapidKeys("VAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=mailto:a@b.c\n")).toBe(
    false,
  )
})
