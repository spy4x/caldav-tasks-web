import type { ComponentChildren } from "preact"
import { ErrorBoundary } from "@spy4x/preact-ui/error-boundary"

/**
 * Stands around the whole app: when anything inside throws while it renders, the person gets a
 * screen that says so and a Reload button, not a blank page. The error goes to the console, which
 * is the only place it is reported.
 */
export function AppBoundary({ children }: { children: ComponentChildren }) {
  return (
    <ErrorBoundary
      headingLevel={1}
      dataE2E="app-error"
      onError={(error) => console.error(error)}
    >
      {children}
    </ErrorBoundary>
  )
}
