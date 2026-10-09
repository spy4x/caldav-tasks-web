import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { EnhancedForm } from "@spy4x/preact-ui/enhanced-form"
import { Field } from "@spy4x/preact-ui/field"
import { Input } from "@spy4x/preact-ui/input"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { LIST_HOLDS_EVENTS } from "@api/caldav.ts"

/** What the form hands back on Save: the trimmed name and the colour as `#rrggbb`. */
export interface ListDraft {
  name: string
  color: string
}

/** Props of {@link ListSettingsScreen}. */
export interface ListSettingsScreenProps {
  /** The list to edit. Without one the screen creates a new list. */
  list?: TaskList
  /**
   * How many tasks the list holds, completed ones included, for the delete question. `null` when
   * the completed ones could not be loaded, so the question names no number rather than a low one.
   */
  taskCount?: number | null
  /** True while the completed tasks are still loading: Delete waits, so the count is never low. */
  counting?: boolean
  /** True when the list may also hold calendar events: it cannot be deleted here, and says why. */
  holdsEvents?: boolean
  /** True when the app cannot reach its server: nothing can be saved or deleted then. */
  offline?: boolean
  saving?: boolean
  deleting?: boolean
  /** Why the last save or delete failed, ready to show. */
  error?: string | null
  onSave: (draft: ListDraft) => void
  /** Adds "Delete list" to "More actions"; it asks first. */
  onDelete?: () => void
  /** Where Back and Cancel go. */
  backHref: string
  /** Follows Back and Cancel without a page load. */
  navigate?: (href: string) => void
}

/** The colour a new list starts with. */
export const DEFAULT_LIST_COLOR = `#1e88e5`

/** What the screen says while the app is offline. */
export const LIST_ADMIN_OFFLINE =
  `You are offline. Lists can be created, changed and deleted only while connected.`

/**
 * A stored colour as the colour picker takes it: `#rrggbb`. Tasks.org stores `#RRGGBBAA`, whose
 * alpha the picker cannot show; a colour in any other form falls back to the default.
 */
export function pickerColor(color: string | undefined): string {
  const match = color?.match(/^#[0-9a-f]{6}/i)
  return match ? match[0].toLowerCase() : DEFAULT_LIST_COLOR
}

/** The delete question, naming the list and how many tasks go with it; `null` names no number. */
export function deleteQuestion(name: string, taskCount: number | null): string {
  if (taskCount === null) return `Delete ${name} and all its tasks?`
  if (taskCount === 0) return `Delete ${name}?`
  return `Delete ${name} and its ${taskCount} ${taskCount === 1 ? `task` : `tasks`}?`
}

/**
 * Create or edit a task list: its name and colour. Editing adds "Delete list" to "More actions",
 * which asks first and names the number of tasks it removes. A list is a calendar on the CalDAV
 * server, so nothing here works offline: the screen says so and disables Save and Delete. A list
 * that may also hold calendar events offers no Delete, and says to delete it in a calendar app.
 */
export function ListSettingsScreen(props: ListSettingsScreenProps): JSX.Element {
  const { list, navigate, backHref, offline = false, saving = false, deleting = false } = props
  const { counting = false, holdsEvents = false } = props
  const [name, setName] = useState(list?.name ?? ``)
  const [color, setColor] = useState(pickerColor(list?.color))
  const [nameError, setNameError] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)
  const [asking, setAsking] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  // A refused save puts the cursor back in the name; `attempt` makes a repeated refusal count.
  useEffect(() => {
    if (attempt > 0) nameInput.current?.focus()
  }, [attempt])

  const save = () => {
    if (offline) return
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(`Enter a name`)
      setAttempt((count) => count + 1)
      return
    }
    props.onSave({ name: trimmed, color })
  }

  const taskCount = props.taskCount === undefined ? 0 : props.taskCount
  return (
    <div class="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title={list ? `List settings` : `New list`}
        subtitle={list?.name}
        back={{ href: backHref, label: `Back` }}
        navigate={navigate}
        menu={list && props.onDelete && !holdsEvents && (
          <DropdownItem
            danger
            disabled={offline || deleting || counting}
            onClick={() => setAsking(true)}
            dataE2E="list-delete"
          >
            Delete list
          </DropdownItem>
        )}
        menuDataE2E="list-menu"
      />
      {offline && <Notice tone="warning" data-e2e="list-offline">{LIST_ADMIN_OFFLINE}</Notice>}
      {list && holdsEvents && (
        <p class="text-sm text-muted" data-e2e="list-holds-events">{LIST_HOLDS_EVENTS}</p>
      )}
      <EnhancedForm
        status={saving ? `sending` : `idle`}
        labels={{ sending: ``, done: ``, failed: `` }}
        onSubmit={save}
        class="space-y-0!"
      >
        <div class="space-y-4" data-e2e="list-form">
          <Field id="list-name" label="Name" error={nameError} required>
            {(wiring) => (
              <Input
                ref={nameInput}
                id={wiring.id}
                name="name"
                autocomplete="off"
                maxLength={255}
                aria-required="true"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={wiring[`aria-describedby`]}
                value={name}
                onInput={(event) => {
                  setName(event.currentTarget.value)
                  setNameError(undefined)
                }}
                data-e2e="list-name"
              />
            )}
          </Field>
          <Field id="list-color" label="Colour">
            {(wiring) => (
              <input
                id={wiring.id}
                type="color"
                name="color"
                class="h-11 w-20 cursor-pointer rounded-md border border-subtle bg-canvas p-1"
                value={color}
                onInput={(event) => setColor(event.currentTarget.value.toLowerCase())}
                data-e2e="list-color"
              />
            )}
          </Field>
          {props.error && (
            <p role="alert" class="text-sm text-danger" data-e2e="list-form-error">
              {props.error}
            </p>
          )}
          <div class="flex gap-3 sm:justify-end">
            <Button
              href={backHref}
              navigate={navigate}
              variant="outline"
              class="flex-1 sm:flex-none"
              data-e2e="list-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={saving}
              busyLabel={list ? `Saving…` : `Creating…`}
              disabled={offline}
              class="flex-1 sm:flex-none"
              data-e2e="list-save"
            >
              {list ? `Save` : `Create list`}
            </Button>
          </div>
        </div>
      </EnhancedForm>
      {asking && list && (
        <ConfirmDialog
          title={deleteQuestion(list.name, taskCount)}
          message={`The list and everything in it are deleted from the CalDAV server, and from Tasks.org at its next sync. This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          tone="danger"
          dataE2E="list-delete-dialog"
          onConfirm={() => {
            setAsking(false)
            props.onDelete?.()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}
