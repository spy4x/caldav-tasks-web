import "./app.css"
import { Route, Switch, useLocation } from "wouter-preact"
import { useEffect } from "preact/hooks"
import { AppFrame, PATHS, PlaceholderPage } from "@ui/frame.tsx"
import { loadSession, SessionStatus, sessionStatus } from "./state/session.ts"
import { SignInView } from "./views/SignInView.tsx"

/**
 * The app: the sign-in screen until the owner signs in, then the frame around five placeholder
 * pages. Later issues replace each page with its screen and wire it to state.
 */
export function App() {
  useEffect(() => void loadSession(), [])
  // Nothing is drawn until the server answers, so neither screen flashes past the other.
  if (sessionStatus.value === SessionStatus.Unknown) return null
  if (sessionStatus.value === SessionStatus.SignedOut) return <SignInView />
  return <SignedInApp />
}

function SignedInApp() {
  const [location, navigate] = useLocation()
  return (
    <AppFrame currentPath={location} navigate={navigate}>
      <Switch>
        <Route path={PATHS.today}>{() => <PlaceholderPage title="Today" />}</Route>
        <Route path={PATHS.upcoming}>{() => <PlaceholderPage title="Upcoming" />}</Route>
        <Route path={PATHS.lists}>{() => <PlaceholderPage title="Lists" />}</Route>
        <Route path={PATHS.search}>{() => <PlaceholderPage title="Search" />}</Route>
        <Route path={PATHS.more}>{() => <PlaceholderPage title="More" />}</Route>
        <Route>{() => <PlaceholderPage title="Not found" />}</Route>
      </Switch>
    </AppFrame>
  )
}
