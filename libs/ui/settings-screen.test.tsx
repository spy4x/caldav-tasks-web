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
  onShowShortcuts: () => {},
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
  await mount(
    <SettingsScreen {...props({ signingOut: true })} />,
    async ({ root }) => {
      const button = must<HTMLButtonElement>(root, `[data-e2e="sign-out"]`)
      expect(button.disabled).toBe(true)
      expect(button.textContent).toContain(`Signing out`)
    },
  )
})

Deno.test("a failed sign-out shows its message in an alert", () => {
  const html = renderToString(<SettingsScreen {...props({ error: `Sign-out failed (500).` })} />)
  expect(html).toMatch(/role="alert"[^>]*>Sign-out failed \(500\)\./)
})

Deno.test("the Show shortcuts button opens the shortcuts list", async () => {
  let shown = 0
  await mount(
    <SettingsScreen {...props({ onShowShortcuts: () => shown++ })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `[data-e2e="show-shortcuts"]`).click())
      expect(shown).toBe(1)
    },
  )
})

Deno.test("Settings offers an Install button only while the browser can install the app", async () => {
  let installs = 0
  await mount(
    <SettingsScreen {...props({ installMode: `prompt`, onInstall: () => installs++ })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `[data-e2e="install-app"]`).click())
      expect(installs).toBe(1)
    },
  )
  for (const mode of [`installed`, `unavailable`] as const) {
    const html = renderToString(<SettingsScreen {...props({ installMode: mode })} />)
    expect(html).not.toContain(`Install app`)
  }
  expect(renderToString(<SettingsScreen {...props()} />)).not.toContain(`Install app`)
})

Deno.test("on an iPhone Settings explains Add to Home Screen and has no Install button", () => {
  const html = renderToString(<SettingsScreen {...props({ installMode: `ios` })} />)
  expect(html).toContain(`Add to Home Screen`)
  expect(html).not.toContain(`install-app`)
})
