import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef } from "preact/hooks"

/** Props of {@link FocusKeeper}. */
export interface FocusKeeperProps {
  children: ComponentChildren
  /** Names the region for screen readers. */
  label?: string
  class?: string
}

const CHECKS = `input[data-task-check]`

interface Pending {
  uid: string
  next?: string
  prev?: string
}

/**
 * Keeps the keyboard where the person is when a row they just checked leaves the page. Completing a
 * task usually removes it, and the browser then drops focus to the top of the page. Wrapped around
 * the task rows of a screen, this puts focus back on the next row's check, else the one before it,
 * else the region itself, which is focusable but not in the tab order.
 *
 * It only acts when focus was lost: if the person moved on in the meantime, or the check is still
 * there, it does nothing.
 */
export function FocusKeeper({ children, label, class: className }: FocusKeeperProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const pending = useRef<Pending | null>(null)

  const remember = (event: Event) => {
    const target = event.target as HTMLElement | null
    const uid = target?.getAttribute?.(`data-task-check`)
    if (!uid || !root.current) return
    const checks = [...root.current.querySelectorAll<HTMLInputElement>(CHECKS)]
    const at = checks.indexOf(target as HTMLInputElement)
    pending.current = {
      uid,
      next: checks[at + 1]?.getAttribute(`data-task-check`) ?? undefined,
      prev: checks[at - 1]?.getAttribute(`data-task-check`) ?? undefined,
    }
  }

  useEffect(() => {
    const waiting = pending.current
    const region = root.current
    if (!waiting || !region) return
    const active = region.ownerDocument.activeElement
    if (active && active !== region.ownerDocument.body) {
      // Still on the check that was pressed: the row may leave on a later render, so keep waiting.
      // Anywhere else: the person moved on, so leave them there.
      if (active.getAttribute(`data-task-check`) !== waiting.uid) pending.current = null
      return
    }
    const find = (uid?: string) =>
      uid === undefined
        ? null
        : [...region.querySelectorAll<HTMLInputElement>(CHECKS)].find((check) =>
          check.getAttribute(`data-task-check`) === uid
        ) ?? null
    const target = find(waiting.uid) ?? find(waiting.next) ?? find(waiting.prev)
    if (target) target.focus()
    else region.focus()
    pending.current = null
  })

  return (
    <div
      ref={root}
      tabIndex={-1}
      role={label ? `region` : undefined}
      aria-label={label}
      class={`outline-none ${className ?? ``}`}
      onChange={remember}
    >
      {children}
    </div>
  )
}
