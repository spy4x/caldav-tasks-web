import { useEffect } from "preact/hooks"
import { Route, Router, Switch } from "wouter-preact"
import { isAuthenticated, selectedCollection, selectedServerId, user } from "./state/+index.ts"
import { api } from "./lib/api.ts"
import { LoginPage } from "./pages/Login.tsx"
import { DashboardPage } from "./pages/Dashboard.tsx"
import { SettingsPage } from "./pages/Settings.tsx"
import { Layout } from "./components/Layout.tsx"

function ProtectedRoute({ children }: { children: preact.ComponentChildren }) {
  if (!isAuthenticated.value) return <LoginPage />
  return <Layout>{children}</Layout>
}

export function App() {
  useEffect(() => {
    // Skip /api/auth/me if no userId in localStorage (no session possible)
    const storedId = globalThis.localStorage?.getItem("userId")
    if (!storedId) {
      user.value = null
      return
    }
    api.me()
      .then((data) => {
        user.value = data.user
        localStorage.setItem("userId", String(data.user.id))
      })
      .catch(() => {
        user.value = null
        localStorage.removeItem("userId")
      })
  }, [])

  return (
    <Router>
      <Switch>
        <Route
          path="/settings"
          component={() => (
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile"
          component={() => (
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/"
          component={() =>
            isAuthenticated.value
              ? (
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              )
              : <LoginPage />}
        />
      </Switch>
    </Router>
  )
}
