import type { ComponentChildren, JSX } from "preact"
import { Page } from "@spy4x/preact-ui/layout"
import { EmptyState } from "@spy4x/preact-ui/empty-state"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"

/** Props of {@link ScreenLayout}. */
export interface ScreenLayoutProps {
  /** The `PageHeader`. */
  header: ComponentChildren
  /** The quick add form, when the screen has one. */
  quickAdd?: ComponentChildren
  children: ComponentChildren
}

/**
 * The frame the task screens share. On a phone the quick add sits at the bottom, above the tab bar
 * and within reach of a thumb; from `md` up it sits under the header. It comes second in the
 * markup, so the keyboard meets it where it appears on a desktop.
 */
export function ScreenLayout({ header, quickAdd, children }: ScreenLayoutProps): JSX.Element {
  return (
    <Page class="min-h-[calc(100dvh-4rem)] gap-4 py-4 md:min-h-0 md:py-8">
      {header}
      {quickAdd && (
        <div class="z-10 border-t border-subtle bg-canvas py-2 max-md:sticky max-md:bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] max-md:order-last md:border-t-0 md:py-0">
          {quickAdd}
        </div>
      )}
      <div class="flex-1">{children}</div>
    </Page>
  )
}

/** A quiet heading for a group of rows, such as a day or a list. */
export function GroupHeading(
  { id, children }: { id?: string; children: ComponentChildren },
): JSX.Element {
  return (
    <h2 id={id} class="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
  )
}

/** What a screen shows while its data loads: the skeleton, announced to screen readers. */
export function LoadingBody({ label }: { label: string }): JSX.Element {
  return (
    <div role="status" aria-busy="true" data-e2e="loading">
      <span class="sr-only">{label}</span>
      <LoadingSkeleton rows={3} />
    </div>
  )
}

/** The empty state every task screen uses, with a heading level that fits under the page's `h1`. */
export function EmptyBody(
  { title, description, icon }: { title: string; description?: string; icon?: ComponentChildren },
): JSX.Element {
  return <EmptyState title={title} description={description} icon={icon} headingLevel={2} />
}
