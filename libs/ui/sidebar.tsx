import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { parseQuickAdd } from "@spy4x/platform"
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconFlag,
  IconList,
  IconPlus,
  IconWrench,
} from "@spy4x/preact-icons"
import { AppLink } from "./frame.tsx"

/** What the New task form hands over. */
export interface NewTaskInput {
  /** The task's own text, date words and `!high` included, without the ` / main task` part. */
  text: string
  /** A `YYYY-MM-DD` date from the date field. Wins over a date written in the text. */
  due?: string
  /** The iCalendar priority from the field; 0 lets a `!high` in the text count. */
  priority: number
  /** An existing main task to nest under. */
  parentUid?: string
  /** A main task named after ` / ` that does not exist yet: it is created first. */
  parentTitle?: string
}

/** One entry of the sidebar's lists: a view or a list. */
export interface SidebarLink {
  label: string
  href: string
  /** The dot's colour; a view without one draws the accent. */
  color?: string
  count?: number
}

/** Props of {@link Sidebar}. */
export interface SidebarProps {
  currentPath?: string
  links: readonly SidebarLink[]
  newListHref: string
  settingsHref: string
  /** The open top-level tasks a new task can be nested under. */
  parents: readonly { uid: string; title: string }[]
  /** The viewer's IANA zone, for reading dates written in the task ("Plan Friday"). */
  zone: string
  busy?: boolean
  /** Creates the task. Resolves `true` when it was created, so the form clears. */
  onAdd: (input: NewTaskInput) => Promise<boolean>
  navigate?: (path: string) => void
  /** Only the task field, one line: the page's New task field while the sidebar is hidden. */
  compact?: boolean
  /** Puts the cursor in the task field on arrival, again each time this changes (the page). */
  focusKey?: string
}

const PRIORITIES = [
  { value: 0, label: `None` },
  { value: 9, label: `Low` },
  { value: 5, label: `Medium` },
  { value: 1, label: `High` },
]

const CONTROL =
  `h-9 w-full rounded-lg border border-subtle bg-surface text-sm text-foreground hover:border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-ring)]`

/**
 * Splits `Milk / Buy groceries` at its last ` /` into the task and the main task it goes under.
 * A slash with no space before it (`A/B testing`) is part of the title.
 */
export function splitParent(text: string): { child: string; parent?: string } {
  const match = /^(.*\S)\s+\/\s*([^/]*)$/s.exec(text)
  return match ? { child: match[1].trim(), parent: match[2].trim() } : { child: text.trim() }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A field's label above its control. */
function Field(
  { label, children, hint }: { label: string; children: ComponentChildren; hint?: string },
) {
  return (
    <label class="flex flex-col gap-2">
      <span class="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span class="text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** A native select with an icon on the left and a chevron on the right. */
function IconSelect(
  props: {
    icon: ComponentChildren
    value: string
    onChange: (value: string) => void
    options: readonly { value: string; label: string }[]
    active?: boolean
    e2e: string
  },
) {
  return (
    <span class="relative block">
      <span
        class={`pointer-events-none absolute inset-y-0 start-3 flex items-center ${
          props.active ? `text-accent-text` : `text-muted`
        }`}
      >
        {props.icon}
      </span>
      <select
        class={`${CONTROL} cursor-pointer appearance-none ps-8 pe-8 ${
          props.active ? `border-accent bg-selected-soft text-accent-text` : ``
        }`}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        data-e2e={props.e2e}
      >
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown
        class="pointer-events-none absolute inset-y-0 end-3 my-auto size-3 text-muted"
        aria-hidden="true"
      />
    </span>
  )
}

/** A short date such as "Fri 13 Nov", for a `YYYY-MM-DD` and an optional `HH:MM`. */
function shortDate(date: string, time?: string): string {
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: `short`,
    day: `numeric`,
    month: `short`,
    timeZone: `UTC`,
  })
  return time ? `${day}, ${time}` : day
}

/**
 * Puts the cursor in a new-task field as a page opens, so typing and Enter add a task. Only on a
 * desktop, where no keyboard pops up; after the route announcer has placed the focus; and not when
 * another field already holds it. Returns the cancel.
 */
export function focusOnArrival(field: () => HTMLElement | null | undefined): () => void {
  const timer = setTimeout(() => {
    const el = field()
    if (!el || el.offsetParent === null) return
    if (!globalThis.matchMedia?.(`(min-width: 768px)`).matches) return
    const active = document.activeElement
    if (active?.closest(`input, textarea, select, [contenteditable="true"], dialog`)) return
    el.focus()
  })
  return () => clearTimeout(timer)
}

type MenuItem = { kind: `pick`; uid: string; title: string } | { kind: `create`; title: string }

/**
 * The desktop column: the New task form, the lists with their counts, and Settings.
 *
 * The task field reads a date written in it ("Plan Friday" is due on Friday), and ` /` opens a
 * menu of main tasks to nest the new one under. `Milk / Buy groceries` nests Milk under Buy
 * groceries, which is created first when there is no such main task.
 */
export function Sidebar(props: SidebarProps): JSX.Element {
  const [title, setTitle] = useState(``)
  const [due, setDue] = useState(``)
  const [priority, setPriority] = useState(0)
  const [parentUid, setParentUid] = useState(``)
  const [error, setError] = useState(``)
  const [focused, setFocused] = useState(false)
  const [menuOff, setMenuOff] = useState(false)
  const [active, setActive] = useState(0)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const parentStillThere = props.parents.some((p) => p.uid === parentUid)

  const split = splitParent(title)
  const query = split.parent ?? ``
  const named = split.parent ? props.parents.find((p) => same(p.title, query)) : undefined
  const items: MenuItem[] = split.parent === undefined ? [] : [
    ...props.parents
      .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
      .map((p) => ({ kind: `pick` as const, uid: p.uid, title: p.title })),
    ...(query && !named ? [{ kind: `create` as const, title: query }] : []),
  ]
  const menuOpen = focused && !menuOff && items.length > 0
  const current = Math.min(active, items.length - 1)

  const parsed = split.child
    ? parseQuickAdd(split.child, { now: new Date(), timeZone: props.zone })
    : undefined
  const hintDue = !due && parsed?.due ? shortDate(parsed.due.date, parsed.due.time) : ``
  const hintParent = split.parent ? (named?.title ?? split.parent) : ``

  const submit = async (event?: Event) => {
    event?.preventDefault()
    if (props.busy) return
    if (!split.child) {
      setError(`Type what you need to do.`)
      titleRef.current?.focus()
      return
    }
    setError(``)
    const input: NewTaskInput = { text: split.child, priority, ...(due ? { due } : {}) }
    if (named) input.parentUid = named.uid
    else if (split.parent) input.parentTitle = split.parent
    else if (parentStillThere && parentUid) input.parentUid = parentUid
    if (await props.onAdd(input)) {
      setTitle(``)
      setDue(``)
      setPriority(0)
      titleRef.current?.focus()
    }
  }

  const choose = (item: MenuItem) => {
    if (item.kind === `create`) {
      void submit()
      return
    }
    setTitle(split.child)
    setParentUid(item.uid)
  }

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === `ArrowDown` || event.key === `ArrowUp`) {
        event.preventDefault()
        const step = event.key === `ArrowDown` ? 1 : -1
        setActive((current + step + items.length) % items.length)
        return
      }
      if (event.key === `Enter` || event.key === `Tab`) {
        event.preventDefault()
        choose(items[current])
        return
      }
      if (event.key === `Escape`) {
        event.preventDefault()
        setMenuOff(true)
        return
      }
    }
    if (event.key === `Escape`) {
      // Leaves the field, so the page's one-key shortcuts work again.
      event.currentTarget.blur()
      return
    }
    if (event.key === `Enter` && !event.shiftKey) void submit(event)
  }

  useEffect(
    () => props.focusKey === undefined ? undefined : focusOnArrival(() => titleRef.current),
    [props.focusKey],
  )

  const field = (
    <>
      <span class="relative block">
        <IconPlus
          class={`pointer-events-none absolute start-4 size-4 text-muted ${
            props.compact ? `top-4` : `top-3`
          }`}
          aria-hidden="true"
        />
        <textarea
          ref={titleRef}
          class={`${CONTROL} block resize-none pe-3 text-[15px] leading-6 placeholder:text-placeholder ${
            props.compact ? `h-12 overflow-hidden ps-12 py-3` : `h-26 ps-12 py-2`
          }`}
          placeholder={props.compact ? `Add a new task…` : `What do you need to do?`}
          aria-label={props.compact ? `New task` : undefined}
          value={title}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls="new-task-parents"
          aria-autocomplete="list"
          aria-activedescendant={menuOpen ? `new-task-parent-${current}` : undefined}
          aria-invalid={error ? true : undefined}
          onInput={(event) => {
            setTitle(event.currentTarget.value)
            setMenuOff(false)
            setActive(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          data-e2e="new-task-title"
        />
        {menuOpen && (
          <ul
            id="new-task-parents"
            role="listbox"
            aria-label="Nest under"
            class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-subtle bg-surface p-1 text-sm shadow-lg"
            data-e2e="new-task-parent-menu"
          >
            {items.map((item, index) => (
              <li
                key={item.kind === `pick` ? item.uid : `create`}
                id={`new-task-parent-${index}`}
                role="option"
                aria-selected={index === current}
                class={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 ${
                  index === current ? `bg-selected-soft text-accent-text` : `hover:bg-hover`
                }`}
                // Keeps the focus in the field, so the menu does not close before the pick.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span aria-hidden="true">{item.kind === `pick` ? `↳` : `+`}</span>
                <span class="truncate">
                  {item.kind === `pick` ? item.title : `Create “${item.title}” as a main task`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </span>
      {(hintDue || hintParent) && !error && (
        <span class="flex flex-wrap gap-x-3 text-xs text-muted" data-e2e="new-task-hint">
          {hintDue && <span>Due {hintDue}</span>}
          {hintParent && <span>Under {hintParent}{named ? `` : ` (new)`}</span>}
        </span>
      )}
      {error && <span class="text-xs text-danger">{error}</span>}
    </>
  )

  if (props.compact) {
    return (
      <form class="flex flex-col gap-1" onSubmit={submit} data-e2e="new-task-form">
        {field}
      </form>
    )
  }

  return (
    <div class="flex flex-col gap-6">
      <form class="flex flex-col gap-6" onSubmit={submit} data-e2e="new-task-form">
        <div class="flex flex-col gap-1">
          <h2 class="text-[22px] font-semibold leading-tight">New task</h2>
          <p class="text-[13px] text-muted">Capture a task, then add the details.</p>
        </div>
        <Field label="Task">
          {field}
        </Field>
        <Field label="Due date">
          <span class="relative block">
            <IconCalendar
              class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
              aria-hidden="true"
            />
            <input
              type="date"
              class={`${CONTROL} ps-8 pe-3 ${due ? `` : `text-muted`}`}
              value={due}
              onInput={(event) => setDue(event.currentTarget.value)}
              data-e2e="new-task-due"
            />
          </span>
        </Field>
        <Field label="Priority">
          <IconSelect
            icon={<IconFlag class="size-4" aria-hidden="true" />}
            value={String(priority)}
            onChange={(value) => setPriority(Number(value))}
            options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
            e2e="new-task-priority"
          />
        </Field>
        {props.parents.length > 0 && (
          <Field label="Nest under" hint="Or type “ / ” after the task to pick or name one.">
            <IconSelect
              icon={<span aria-hidden="true">↳</span>}
              value={parentStillThere ? parentUid : ``}
              onChange={setParentUid}
              options={[
                { value: ``, label: `None` },
                ...props.parents.map((p) => ({ value: p.uid, label: p.title })),
              ]}
              active={parentStillThere}
              e2e="new-task-parent"
            />
          </Field>
        )}
        <button
          type="submit"
          disabled={props.busy}
          class="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
          data-e2e="new-task-add"
        >
          <IconPlus class="size-4" aria-hidden="true" />
          Add task
        </button>
      </form>

      <nav aria-label="To do lists" class="flex flex-col gap-4 border-t border-subtle pt-6">
        <div class="flex items-center justify-between">
          <h2 class="flex items-center gap-3 text-lg font-semibold">
            <IconList class="size-5" aria-hidden="true" />
            To do lists
          </h2>
          <AppLink
            href={props.newListHref}
            navigate={props.navigate}
            aria-label="New list"
            class="flex size-7 items-center justify-center rounded-md border border-subtle text-muted hover:bg-hover hover:text-foreground"
          >
            <IconPlus class="size-4" aria-hidden="true" />
          </AppLink>
        </div>
        <ul class="-mx-2 flex flex-col gap-px" data-e2e="sidebar-lists">
          {props.links.map((link) => {
            const current = link.href === props.currentPath
            return (
              <li key={link.href}>
                <AppLink
                  href={link.href}
                  navigate={props.navigate}
                  aria-current={current ? `page` : undefined}
                  class={`flex h-8 items-center gap-4 rounded-lg px-3 text-[15px] ${
                    current ? `bg-selected-soft` : `hover:bg-hover`
                  }`}
                >
                  <span
                    class="size-2.5 shrink-0 rounded-full bg-accent"
                    style={link.color ? { backgroundColor: link.color } : undefined}
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{link.label}</span>
                  {link.count !== undefined && (
                    <span class="min-w-6 rounded-md bg-chip px-1 text-center text-xs text-muted">
                      {link.count}
                      <span class="sr-only">{link.count === 1 ? ` open task` : ` open tasks`}</span>
                    </span>
                  )}
                </AppLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div class="border-t border-subtle pt-4">
        <AppLink
          href={props.settingsHref}
          navigate={props.navigate}
          aria-current={props.currentPath === props.settingsHref ? `page` : undefined}
          class="-mx-2 flex h-10 items-center gap-3 rounded-lg px-2 text-[15px] hover:bg-hover"
        >
          <IconWrench class="size-5" aria-hidden="true" />
          <span class="flex-1">Settings</span>
          <IconChevronRight class="size-4 text-muted" aria-hidden="true" />
        </AppLink>
      </div>
    </div>
  )
}
