import type { ComponentChildren, JSX } from "preact"
import { Button } from "@spy4x/preact-ui/button"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { ThemeToggle, type ThemeToggleStore } from "@spy4x/preact-ui/theme-toggle"
import { ScreenLayout } from "./task-screen.tsx"

/** Props of {@link SettingsScreen}. */
export interface SettingsScreenProps {
  /** The app's theme store; the toggle reads and cycles it. */
  themeStore: ThemeToggleStore
  /** The CalDAV server this install talks to, or `null` while it is not known (no network yet). */
  caldavUrl: string | null
  /** The CalDAV account in use, or `null` while it is not known. Never a password. */
  caldavUsername: string | null
  /** The IANA zone the app reads times in. */
  timeZone: string
  /** The app's version. */
  version: string
  onSignOut: () => void
  /** Sign-out is running: the button waits. */
  signingOut?: boolean
  /** Why the last sign-out failed. */
  error?: string | null
}

const UNKNOWN = `Not known yet. It loads when the server answers.`

/**
 * Settings: the theme, the CalDAV server and account in use, the time zone, the version and
 * "Sign out", with one sentence on how to sign out everywhere. Nothing here is edited except the
 * theme: the server and account come from the install's environment.
 */
export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  return (
    <ScreenLayout header={<PageHeader title="Settings" />}>
      <div class="flex flex-col gap-6">
        <dl class="flex flex-col" data-e2e="settings">
          <Row term="Theme" e2e="settings-theme">
            <ThemeToggle store={props.themeStore} />
          </Row>
          <Row term="CalDAV server" e2e="settings-server">
            <span class="break-all">{props.caldavUrl ?? UNKNOWN}</span>
          </Row>
          <Row term="CalDAV account" e2e="settings-account">
            <span class="break-all">{props.caldavUsername ?? UNKNOWN}</span>
          </Row>
          <Row term="Time zone" e2e="settings-zone">{props.timeZone}</Row>
          <Row term="Version" e2e="settings-version">{props.version}</Row>
        </dl>
        <section aria-labelledby="settings-sign-out" class="flex flex-col gap-2">
          <h2
            id="settings-sign-out"
            class="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            Sign out
          </h2>
          <div class="flex flex-col items-start gap-2">
            <Button
              variant="outline"
              disabled={props.signingOut}
              onClick={props.onSignOut}
              data-e2e="sign-out"
            >
              {props.signingOut ? `Signing out...` : `Sign out`}
            </Button>
            <p role="alert" class="text-sm text-danger" data-e2e="sign-out-error">
              {props.error}
            </p>
          </div>
          <p class="text-sm text-muted">
            To sign out everywhere, change <code>SESSION_SECRET</code>{" "}
            in the server's environment and restart it: every session signed under the old secret
            ends.
          </p>
        </section>
      </div>
    </ScreenLayout>
  )
}

function Row(
  { term, e2e, children }: { term: string; e2e: string; children: ComponentChildren },
): JSX.Element {
  return (
    <div
      class="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-subtle py-2"
      data-e2e={e2e}
    >
      <dt class="text-muted">{term}</dt>
      <dd class="min-w-0">{children}</dd>
    </div>
  )
}
