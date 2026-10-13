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

Deno.test("Sign out with unsent changes asks first, and signs out only after a yes", async () => {
  const calls: string[] = []
  await mount(
    <SettingsScreen {...props({ unsentChanges: 2, onSignOut: () => calls.push(`out`) })} />,
    async ({ root, act }) => {
      const page = root.ownerDocument
      const signOut = must<HTMLButtonElement>(root, `[data-e2e="sign-out"]`)
      await act(() => signOut.click())
      expect(calls).toEqual([])
      const dialog = must<HTMLElement>(page, `[data-e2e="sign-out-dialog"]`)
      expect(dialog.textContent).toContain(`2 changes made on this device have not been sent`)

      await act(() => must<HTMLButtonElement>(page, `[data-e2e="sign-out-dialog-cancel"]`).click())
      expect(calls).toEqual([])
      expect(page.querySelector(`[data-e2e="sign-out-dialog"]`)).toBeNull()

      await act(() => signOut.click())
      await act(() => must<HTMLButtonElement>(page, `[data-e2e="sign-out-dialog-confirm"]`).click())
      expect(calls).toEqual([`out`])
      expect(page.querySelector(`[data-e2e="sign-out-dialog"]`)).toBeNull()
    },
  )
})

Deno.test('the question about one unsent change says "1 change"', async () => {
  await mount(
    <SettingsScreen {...props({ unsentChanges: 1 })} />,
    async ({ root, act }) => {
      await act(() => must<HTMLButtonElement>(root, `[data-e2e="sign-out"]`).click())
      expect(must<HTMLElement>(root.ownerDocument, `[data-e2e="sign-out-dialog"]`).textContent)
        .toContain(`1 change made on this device has not been sent`)
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

Deno.test("Settings shows the Notifications block only when push is given, and its button turns it on", async () => {
  expect(renderToString(<SettingsScreen {...props()} />)).not.toContain(`data-push-status`)
  let enabled = 0
  await mount(
    <SettingsScreen
      {...props({ push: { status: `off`, onEnable: () => enabled++, onDisable: () => {} } })}
    />,
    async ({ root, act }) => {
      const block = must<HTMLElement>(root, `[role="group"][data-push-status="off"]`)
      expect(block.textContent).toContain(`Notifications`)
      await act(() => must<HTMLButtonElement>(block, `[data-push-action="toggle"]`).click())
      expect(enabled).toBe(1)
    },
  )
})
