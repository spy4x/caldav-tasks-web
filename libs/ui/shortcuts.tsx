import type { JSX } from "preact"
import { Kbd } from "@spy4x/preact-ui/kbd"
import { Modal } from "@spy4x/preact-ui/modal"

/** One shortcut as {@link ShortcutsHelp} lists it. */
export interface ShortcutRow {
  description: string
  group: string
  /** The ways to trigger it; each is the keys to press one after the other, such as `["g", "t"]`. */
  keys: readonly (readonly string[])[]
}

/** Props of {@link ShortcutsHelp}. */
export interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
  shortcuts: readonly ShortcutRow[]
}

/**
 * The keyboard shortcuts, grouped, each with its keys drawn as `<kbd>`. A two-key sequence reads
 * "g then t" and a shortcut with two ways reads "e or Enter". `ShortcutsDialog` from the library
 * cannot draw a sequence (its `Kbd` takes one key press), so this builds on `Modal` and `Kbd`.
 */
export function ShortcutsHelp({ open, onClose, shortcuts }: ShortcutsHelpProps): JSX.Element {
  const groups = new Map<string, ShortcutRow[]>()
  for (const row of shortcuts) groups.set(row.group, [...(groups.get(row.group) ?? []), row])
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" cancelLabel="Close">
      <div class="flex flex-col gap-6" data-e2e="shortcuts">
        {[...groups].map(([title, rows]) => (
          <section key={title} class="flex flex-col gap-2">
            <h3 class="text-xs font-semibold text-muted uppercase">{title}</h3>
            <dl class="flex flex-col gap-2">
              {rows.map((row) => {
                return (
                  <div key={row.description} class="flex items-center justify-between gap-4">
                    <dt class="text-sm text-foreground">{row.description}</dt>
                    <dd class="flex flex-wrap items-center justify-end gap-1">
                      {row.keys.map((way, at) => (
                        <span key={at} class="inline-flex items-center gap-1">
                          {at > 0 && <span class="text-sm text-muted">or</span>}
                          {way.map((key, i) => (
                            <span key={i} class="inline-flex items-center gap-1">
                              {i > 0 && <span class="text-sm text-muted">then</span>}
                              <Kbd keys={key} />
                            </span>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
