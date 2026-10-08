import "./app.css"
import { Route, Switch, useLocation } from "wouter-preact"
import { AppFrame, PATHS, PlaceholderPage } from "@ui/frame.tsx"

/**
 * The app: the frame around five placeholder pages. Later issues replace each page with its
 * screen and wire it to state.
 */
export function App() {
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
