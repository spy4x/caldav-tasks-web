import type { ComponentChildren, JSX } from "preact"
import { useRef } from "preact/hooks"
import { IconBars3, IconViewColumns } from "@spy4x/preact-icons"

/** The narrowest and widest the left list can be, in percent of the page. */
export const MIN_SHARE = 25
export const MAX_SHARE = 75

/** The narrowest a list can be dragged to, in pixels, before its task titles break apart. */
export const MIN_WIDTH = 400

/**
 * A left-list width kept between {@link MIN_SHARE} and {@link MAX_SHARE}, whole percents, and so
 * both lists keep {@link MIN_WIDTH} on a page `width` pixels wide.
 */
export function clampShare(share: number, width = Infinity): number {
  const low = Math.min(50, Math.max(MIN_SHARE, MIN_WIDTH / width * 100))
  return Math.round(Math.min(100 - low, Math.max(low, share)))
}

/** Props of {@link TwoLists}. */
export interface TwoListsProps {
  split: boolean
  onSplitChange: (split: boolean) => void
  /** How much of the width the left list takes, in percent. */
  share: number
  onShareChange: (share: number) => void
  left: ComponentChildren
  /** Shown beside `left` when `split`; a phone shows `left` alone. */
  right: ComponentChildren
}

/**
 * One list, or two side by side with a hinge between them that drags (or takes the arrow keys) to
 * make one wider. A "2 lists / Single list" switch sits above. Two lists show on a screen 1024 pixels wide or more.
 */
export function TwoLists(props: TwoListsProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const { split, share } = props
  const option = (value: boolean, label: string, icon: ComponentChildren) => (
    <button
      type="button"
      aria-pressed={split === value}
      class={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] ${
        split === value
          ? `bg-surface text-accent-text shadow-sm ring-1 ring-[var(--color-accent)]`
          : `text-muted hover:text-foreground`
      }`}
      onClick={() => props.onSplitChange(value)}
      data-e2e={value ? `two-lists` : `single-list`}
    >
      {icon}
      {label}
    </button>
  )
  const dragTo = (event: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect?.width) return
    props.onShareChange(clampShare((event.clientX - rect.left) / rect.width * 100, rect.width))
  }

  return (
    <div
      class={`flex w-full flex-col px-4 pt-4 md:px-12 md:pt-8 lg:pt-0 ${
        split ? `` : `max-w-6xl md:group-data-[sidebar-hidden]/frame:max-w-none`
      }`}
    >
      <div class="hidden justify-end pt-6 pb-2 lg:flex">
        <div
          role="group"
          aria-label="Layout"
          class="inline-flex gap-1 rounded-lg border border-subtle bg-canvas p-1"
        >
          {option(true, `2 lists`, <IconViewColumns class="size-4" aria-hidden="true" />)}
          {option(false, `Single list`, <IconBars3 class="size-4" aria-hidden="true" />)}
        </div>
      </div>
      <div ref={box} class="flex min-w-0">
        <div
          class={`min-w-0 flex-1 ${split ? `lg:flex-none lg:basis-[calc(var(--share)-1rem)]` : ``}`}
          style={{ "--share": `${share}%` }}
        >
          {props.left}
        </div>
        {split && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the lists"
              aria-valuenow={share}
              aria-valuemin={MIN_SHARE}
              aria-valuemax={MAX_SHARE}
              tabindex={0}
              title="Drag to resize"
              class="group/hinge relative hidden w-8 shrink-0 cursor-col-resize touch-none justify-center outline-none lg:flex focus-visible:[&>span]:border-[var(--color-accent)]"
              onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTo(event)
              }}
              onDblClick={() => props.onShareChange(50)}
              onKeyDown={(event) => {
                const step = { ArrowLeft: -5, ArrowRight: 5 }[event.key]
                if (step === undefined) return
                event.preventDefault()
                props.onShareChange(
                  clampShare(share + step, box.current?.getBoundingClientRect().width || Infinity),
                )
              }}
              data-e2e="hinge"
            >
              <span class="h-full border-l border-subtle group-hover/hinge:border-[var(--color-accent)]" />
              <span class="absolute top-24 h-12 w-2 rounded-full border border-subtle bg-surface shadow-sm group-hover/hinge:border-[var(--color-accent)]" />
            </div>
            <div class="hidden min-w-0 flex-1 lg:block" data-e2e="second-list">
              {props.right}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
