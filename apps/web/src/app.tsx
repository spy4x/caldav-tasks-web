import "./app.css"
import { useEffect } from "preact/hooks"
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter-preact"
import { Notice } from "@spy4x/preact-ui/notice"
import { Toastr } from "@spy4x/preact-ui/toastr"
import { AppFrame } from "@ui/frame.tsx"
import { gateRedirect, ROUTES } from "./routes.ts"
import { loadSession, SessionStatus, sessionStatus } from "./state/session.ts"
import { notice } from "./state/connection.ts"
import { startSync } from "./state/sync.ts"
import { toasts } from "./state/toasts.ts"
import { SyncBar } from "./views/SyncBar.tsx"
import { ListsView } from "./views/ListsView.tsx"
import { ListView } from "./views/ListView.tsx"
import { ListSettingsView } from "./views/ListSettingsView.tsx"
import { NotFoundView } from "./views/NotFoundView.tsx"
import { SearchView } from "./views/SearchView.tsx"
import { SettingsView } from "./views/SettingsView.tsx"
import { SignInView } from "./views/SignInView.tsx"
import { TaskEditorView } from "./views/TaskEditorView.tsx"
import { TodayView } from "./views/TodayView.tsx"
import { UpcomingView } from "./views/UpcomingView.tsx"

/**
 * The app: every address behind the sign-in gate. A signed-out visit to any page goes to Sign in
 * and, once signed in, back to where the person was going.
 */
export function App() {
  useEffect(() => void loadSession(), [])
  return (
    <>
      <Gate />
      <Toastr toasts={toasts.list.value} onDismiss={toasts.remove} />
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

function SignedInApp() {
  const [location, navigate] = useLocation()
  useEffect(() => startSync(), [])
  return (
    <AppFrame currentPath={location} navigate={navigate}>
      {notice.value && (
        <div class="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
          <Notice tone="warning">{notice.value}</Notice>
        </div>
      )}
      <SyncBar />
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
    </AppFrame>
  )
}
