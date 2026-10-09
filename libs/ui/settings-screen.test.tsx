/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must } from "./mount.test.tsx"
import { SettingsScreen, type SettingsScreenProps } from "./settings-screen.tsx"

const props = (over: Partial<SettingsScreenProps> = {}): SettingsScreenProps => ({
  themeStore: {
    preference: { value: `system` },
    actual: { value: `light` },
    cycle: () => {},
  },
  caldavUrl: `https://dav.example.com/dav/`,
  caldavUsername: `owner`,
  timeZone: `Asia/Ho_Chi_Minh`,
  version: `1.2.3`,
  onSignOut: () => {},
  ...over,
})

Deno.test("settings list the theme, the CalDAV server and account, the time zone and the version", () => {
  const html = renderToString(<SettingsScreen {...props()} />)
  expect(html).toContain(`Theme: auto (light)`)
  expect(html).toContain(`https://dav.example.com/dav/`)
  expect(html).toContain(`>owner<`)
  expect(html).toContain(`Asia/Ho_Chi_Minh`)
  expect(html).toContain(`1.2.3`)
})

Deno.test("an unknown server or account says it loads later instead of showing a blank", () => {
  const html = renderToString(
    <SettingsScreen {...props({ caldavUrl: null, caldavUsername: null })} />,
  )
  expect(html.match(/Not known yet/g)).toHaveLength(2)
})

Deno.test("it says how to sign out everywhere and never shows a password", () => {
  const html = renderToString(<SettingsScreen {...props()} />)
  expect(html).toContain(`SESSION_SECRET`)
  expect(html).not.toMatch(/password/i)
})

Deno.test("Sign out is a button that calls back once and waits while it runs", async () => {
  const calls: string[] = []
  await mount(
    <SettingsScreen {...props({ onSignOut: () => calls.push(`out`) })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `[data-e2e="sign-out"]`).click())
      expect(calls).toEqual([`out`])
    },
  )
  const busy = renderToString(<SettingsScreen {...props({ signingOut: true })} />)
  expect(busy).toMatch(
    /<button[^>]*disabled[^>]*data-e2e="sign-out"|data-e2e="sign-out"[^>]*disabled/,
  )
})

Deno.test("a failed sign-out shows its message in an alert", () => {
  const html = renderToString(<SettingsScreen {...props({ error: `Sign-out failed (500).` })} />)
  expect(html).toMatch(/role="alert"[^>]*>Sign-out failed \(500\)\./)
})
