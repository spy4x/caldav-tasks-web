import type { JSX } from "preact"
import { useId, useRef } from "preact/hooks"
import { IconPlus } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { Input } from "@spy4x/preact-ui/input"

/** Props of {@link QuickAdd}. */
export interface QuickAddProps {
  /** Called with the trimmed title when the form is sent. Never called for a blank field or while `busy`. */
  onAdd: (title: string) => void
  /** The field's accessible name. */
  label?: string
  placeholder?: string
  /** A quiet line under the field that says where the task goes, such as "Due today in Errands". */
  hint?: string
  /** A task is being created: the field and the button wait. */
  busy?: boolean
}

/**
 * One field that creates a task: type, press Enter. The field empties and keeps the focus, so
 * several tasks go in one after another. The "Add task" button is the screen's one filled action.
 *
 * The title is read from the field when the form is sent and never kept in state.
 */
export function QuickAdd(
  { onAdd, label = `New task`, placeholder = `Add a task`, hint, busy = false }: QuickAddProps,
): JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined

  const submit = (event: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    const input = field.current
    const title = input?.value.trim() ?? ``
    if (busy || !input || title === ``) return
    onAdd(title)
    input.value = ``
    input.focus()
  }

  return (
    <form onSubmit={submit} class="flex flex-col gap-1" data-e2e="quick-add">
      <div class="flex items-center gap-2">
        <Input
          ref={field}
          type="text"
          name="title"
          aria-label={label}
          aria-describedby={hintId}
          placeholder={placeholder}
          autocomplete="off"
          enterKeyHint="done"
          readOnly={busy}
          class="min-h-11 flex-1"
          data-e2e="quick-add-input"
        />
        <Button
          type="submit"
          variant="primary"
          size="none"
          disabled={busy}
          class="min-h-11 min-w-11 shrink-0 justify-center px-3"
          data-e2e="quick-add-submit"
        >
          <IconPlus class="size-5" aria-hidden="true" />
          <span class="sr-only">Add task</span>
        </Button>
      </div>
      {hint && <p id={hintId} class="text-sm text-muted">{hint}</p>}
    </form>
  )
}
