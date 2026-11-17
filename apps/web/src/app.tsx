import "./app.css"
import { useCallback, useEffect, useState } from "preact/hooks"
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter-preact"
import { Notice } from "@spy4x/preact-ui/notice"
import { signal } from "@preact/signals"
import { type ToastId, Toastr } from "@spy4x/preact-ui/toastr"
import { useRouteAnnouncer } from "@spy4x/preact-system/route-announcer"
import { AppFrame } from "@ui/frame.tsx"
import { APP_TITLE, pageTitle } from "./page-title.ts"
import { gateRedirect, ROUTES } from "./routes.ts"
import { loadSession, SessionStatus, sessionStatus } from "./state/session.ts"
import { listShortcuts, searchKeyLabel, shortcutsOpen } from "./shortcuts.ts"
import { ShortcutsDialog } from "@spy4x/preact-ui/shortcuts-dialog"
import { leaveGuard } from "./leave-guard.ts"
import { useShortcuts } from "./views/use-shortcuts.ts"
import { calendarsLoaded } from "./state/calendars.ts"
import { notice } from "./state/connection.ts"
import { startSync } from "./state/sync.ts"
import { startPush } from "./state/push.ts"
import { taskLists } from "./state/task-lists.ts"
import { tasks } from "./state/tasks.ts"
import { toasts } from "./state/toasts.ts"
import { InstallOffer } from "./views/InstallOffer.tsx"
import { SyncBar } from "./views/SyncBar.tsx"
import { ListsView } from "./views/ListsView.tsx"
import { ListView } from "./views/ListView.tsx"
import { ListSettingsView } from "./views/ListSettingsView.tsx"
import { NotFoundView } from "./views/NotFoundView.tsx"
import { rememberPage, SearchView } from "./views/SearchView.tsx"
import { SettingsView } from "./views/SettingsView.tsx"
import { SignInAgainView } from "./views/SignInAgainView.tsx"
import { SignInView } from "./views/SignInView.tsx"
import { rememberPageBeforeTask, TaskEditorView } from "./views/TaskEditorView.tsx"
import { TodayView } from "./views/TodayView.tsx"
import { SidebarView } from "./views/SidebarView.tsx"
import { UpcomingView } from "./views/UpcomingView.tsx"

const SHORTCUT_ROWS = listShortcuts()

/**
 * The app: every address behind the sign-in gate. A signed-out visit to any page goes to Sign in
 * and, once signed in, back to where the person was going.
 */
/** Toasts fading out: still drawn for {@link TOAST_EXIT_MS} so they leave softly, not at once. */
const leaving = signal<ReadonlySet<ToastId>>(new Set())
const TOAST_EXIT_MS = 200

function dismissSoftly(id: ToastId): void {
  if (leaving.value.has(id)) return
  leaving.value = new Set(leaving.value).add(id)
  setTimeout(() => {
    toasts.remove(id)
    const rest = new Set(leaving.value)
    rest.delete(id)
    leaving.value = rest
  }, TOAST_EXIT_MS)
}

export function App() {
  useEffect(() => void loadSession(), [])
  return (
    <>
      <Gate />
      <Toastr
        toasts={toasts.list.value.map((toast) => ({
          ...toast,
          duration: toast.duration ?? (toast.action ? 6000 : 3000),
          ...(leaving.value.has(toast.id) ? { dataE2E: `toast-leaving` } : {}),
        }))}
        onDismiss={dismissSoftly}
        corner="bottom-right"
        class="app-toasts"
      />
    </>
  )
}

function Gate() {
  const [path] = useLocation()
  const search = useSearch()
  const status = sessionStatus.value
  // Nothing is drawn until the server answers, so neither screen flashes past the other.
  if (status === SessionStatus.Unknown) return null
  const to = gateRedirect(status, path, search)
  if (to) return <Redirect to={to} replace />
  if (status === SessionStatus.SignedOut) return <SignInView />
  return <SignedInApp />
}

/** Where this browser remembers that the sidebar was hidden. */
const SIDEBAR_HIDDEN = `sidebar-hidden`

function SignedInApp() {
  const [location, navigate] = useLocation()
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_HIDDEN) === `1`
    } catch {
      return false
    }
  })
  useEffect(() => startSync(), [])
  // Here and not in Settings, so every page load saves this device's subscription again.
  useEffect(() => startPush(), [])
  // The sign-in page that follows a sign-out does not keep the name of the last page.
  useEffect(() => () => void (document.title = APP_TITLE), [])
  const guarded = useCallback((to: string) => leaveGuard.navigate(() => navigate(to)), [navigate])
  useShortcuts(navigate)
  useEffect(() => {
    const page = `${location}${globalThis.location.search}`
    rememberPage(page)
    rememberPageBeforeTask(page)
  }, [location])
  useRouteAnnouncer({
    path: location,
    // Control K opens Search with the cursor in its field and `n` opens Today with it in the quick add:
    // a page that focused its own control keeps it.
    keepPageFocus: true,
    // The address as the browser holds it: the router's own is half decoded, which loses a task
    // whose UID holds `@`, `/`, `?`, `#` or `+`.
    title: pageTitle(globalThis.location.pathname, {
      lists: taskLists.value,
      tasks: tasks.value,
      loaded: calendarsLoaded.value,
    }),
  })
  return (
    <AppFrame
      currentPath={location}
      navigate={guarded}
      searchKey={searchKeyLabel()}
      sidebarHidden={sidebarHidden}
      onSidebarHiddenChange={(hidden) => {
        setSidebarHidden(hidden)
        try {
          localStorage.setItem(SIDEBAR_HIDDEN, hidden ? `1` : `0`)
        } catch {
          // Not remembered in a private window; it still toggles.
        }
      }}
      sidebar={<SidebarView currentPath={location} navigate={guarded} />}
      newTask={/^\/lists\/[^/]+$/.test(location) || location === ROUTES.today ||
          location === ROUTES.upcoming
        ? <SidebarView compact currentPath={location} navigate={guarded} />
        : undefined}
    >
      {notice.value && (
        <div class="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
          <Notice tone="warning">{notice.value}</Notice>
        </div>
      )}
      <SyncBar />
      <InstallOffer />
      <Switch>
        <Route path={ROUTES.today} component={TodayView} />
        <Route path={ROUTES.upcoming} component={UpcomingView} />
        <Route path={ROUTES.lists} component={ListsView} />
        <Route path={ROUTES.list} component={ListView} />
        <Route path={ROUTES.listSettings} component={ListSettingsView} />
        <Route path={ROUTES.newList} component={ListSettingsView} />
        <Route path={ROUTES.task} component={TaskEditorView} />
        <Route path={ROUTES.search} component={SearchView} />
        <Route path={ROUTES.settings} component={SettingsView} />
        <Route component={NotFoundView} />
      </Switch>
      <ShortcutsDialog
        open={shortcutsOpen.value}
        onClose={() => shortcutsOpen.value = false}
        shortcuts={SHORTCUT_ROWS}
      />
      <SignInAgainView />
    </AppFrame>
  )
}
