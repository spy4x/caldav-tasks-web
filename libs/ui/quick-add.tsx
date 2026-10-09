import type { JSX } from "preact"
import { useId, useRef, useState } from "preact/hooks"
import { IconPlus } from "@spy4x/preact-icons"
import { Badge } from "@spy4x/preact-ui/badge"
import { Button } from "@spy4x/preact-ui/button"
import { Input } from "@spy4x/preact-ui/input"
import { parseQuickAdd, QuickAddPriority, type QuickAddResult } from "@spy4x/platform"
import { IcalDateKind } from "@spy4x/time/ical"
import { dueLabel } from "./due-label.ts"

/** Props of {@link QuickAdd}. */
export interface QuickAddProps {
  /**
   * Called with what the line says when the form is sent: the title without its tokens, tags,
   * contexts, due and priority. Never called while `busy` or when the line leaves no title.
   */
  onAdd: (parsed: QuickAddResult) => void
  /** The viewer's time zone: "tomorrow" and "3pm" are read in it. */
  zone: string
  /** The clock; a test passes a fixed one. */
  now?: () => Date
  /** The field's accessible name. */
  label?: string
  placeholder?: string
  /** A quiet line under the field that says where the task goes, such as "Due today in Errands". */
  hint?: string
  /** A task is being created: the field and the button wait. */
  busy?: boolean
}

const PRIORITY_LABEL: Record<QuickAddPriority, string> = {
  [QuickAddPriority.High]: `High priority`,
  [QuickAddPriority.Medium]: `Medium priority`,
  [QuickAddPriority.Low]: `Low priority`,
}

/** The recognised parts of a line, as the words a chip and the screen reader share. */
export function quickAddParts(parsed: QuickAddResult, now: Date, zone: string): string[] {
  const parts = [
    ...parsed.tags.map((tag) => `Tag ${tag}`),
    ...parsed.contexts.map((context) => `Context ${context}`),
  ]
  if (parsed.due) {
    const { date, time } = parsed.due
    const label = dueLabel(
      time === undefined
        ? { kind: IcalDateKind.Date, date }
        : { kind: IcalDateKind.Floating, date, time: `${time}:00` },
      now,
      zone,
    )
    parts.push(`Due ${label.text}`)
  }
  if (parsed.priority !== undefined) parts.push(PRIORITY_LABEL[parsed.priority])
  return parts
}

/**
 * One field that creates a task: type, press Enter. The field empties and keeps the focus, so
 * several tasks go in one after another. The "Add task" button is the screen's one filled action.
 *
 * The line may carry `#tag`, `@context`, a date, a time and `!high`; each recognised part shows as
 * a chip under the field while typing, and a polite live region reads them out.
 */
export function QuickAdd(
  {
    onAdd,
    zone,
    now = () => new Date(),
    label = `New task`,
    placeholder = `Add a task`,
    hint,
    busy = false,
  }: QuickAddProps,
): JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  const [line, setLine] = useState(``)
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const parsed = parseQuickAdd(line, { now: now(), timeZone: zone })
  const parts = quickAddParts(parsed, now(), zone)

  const submit = (event: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    const input = field.current
    if (busy || !input) return
    const result = parseQuickAdd(input.value, { now: now(), timeZone: zone })
    if (result.title === ``) return
    onAdd(result)
    input.value = ``
    setLine(``)
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
          onInput={(event) => setLine(event.currentTarget.value)}
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
      {parts.length > 0 && (
        <ul
          class="flex flex-wrap gap-1"
          aria-label="Recognised in your line"
          data-e2e="quick-add-chips"
        >
          {parts.map((part) => (
            <li key={part}>
              <Badge text={part} />
            </li>
          ))}
        </ul>
      )}
      <p class="sr-only" role="status" aria-live="polite" data-e2e="quick-add-live">
        {parts.join(`, `)}
      </p>
      {hint && <p id={hintId} class="text-sm text-muted">{hint}</p>}
    </form>
  )
}
