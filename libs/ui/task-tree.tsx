import type { JSX } from "preact"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { flattenTree } from "@spy4x/platform/universal/ical-tasks-view"
import { isOpen, type Task, type TaskNode } from "@spy4x/time/ical-tasks-model"
import { type RowList, TaskRow } from "./task-row.tsx"

/** Props of {@link TaskTree}. */
export interface TaskTreeProps {
  /** The tasks with their subtasks, as `buildTree` returns them, in display order. */
  nodes: readonly TaskNode[]
  /** Names the list of rows for screen readers, such as "Overdue". */
  label: string
  zone: string
  now: Date
  /** The list a task belongs to, for views that mix lists. Rows show it when it returns one. */
  listOf?: (task: Task) => RowList | undefined
  /** The `UID`s of tasks whose subtasks start hidden. */
  collapsed?: ReadonlySet<string>
  onComplete: (task: Task, done: boolean) => void
  onOpen: (task: Task) => void
  /**
   * Turns on drag to reorder, for a list in manual order: each row gets a handle. Called once per
   * finished move that keeps the task's parent, with the moved task, the tasks that share its
   * parent in the order shown (the moved one included) and the index it takes among the others.
   */
  onReorder?: (task: Task, siblings: readonly Task[], toIndex: number) => void
  /**
   * Given (with `onReorder`), a drag can also change a task's parent: held over the middle of a
   * row it goes under that row, and it can leave its parent for any other level. Called with the
   * new parent (`undefined` for the top level), its other children in order and the index the
   * task takes among them.
   */
  onMoveUnder?: (
    task: Task,
    parent: Task | undefined,
    siblings: readonly Task[],
    toIndex: number,
  ) => void
  /** Quiet rows with no lines between them, as in the Completed section. */
  plain?: boolean
  /** Renames a task in place; see TaskRow's `onRename`. */
  onRename?: (task: Task, title: string) => void
  /** Adds a task beside one, from the line Enter opens while renaming. */
  onAddSibling?: (task: Task, title: string) => void | Promise<string | undefined>
  /** Deletes a task from its row's hover "Delete". */
  onDelete?: (task: Task) => void
}

/** Wraps tasks as a tree with no subtasks, for a view that lists tasks flat. */
export function flatNodes(tasks: readonly Task[]): TaskNode[] {
  return tasks.map((task) => ({ task, children: [] }))
}

/** How many tasks sit below a node, at any depth. */
function descendants(node: TaskNode): number {
  return node.children.reduce((sum, child) => sum + 1 + descendants(child), 0)
}

/** How many tasks below a node, at any depth, are finished. */
function doneDescendants(node: TaskNode): number {
  return node.children.reduce(
    (sum, child) => sum + (isOpen(child.task) ? 0 : 1) + doneDescendants(child),
    0,
  )
}

/** Where a dragged task would land: under `parent` (absent: the top level), at `index` among the others there. */
interface Place {
  parent?: string
  index: number
}

interface Drag {
  uid: string
  from: Place
  place: Place
  /** The row it would go under, while held over that row's middle. */
  into?: string
  keyboard: boolean
}

interface Row {
  task: Task
  depth: number
  parent?: string
}

/** The rows shown, top to bottom, leaving out `skip` and everything under it. */
function rowsOf(
  nodes: readonly TaskNode[],
  collapsed: ReadonlySet<string>,
  skip?: string,
  parent?: string,
  depth = 0,
  out: Row[] = [],
): Row[] {
  for (const node of nodes) {
    if (node.task.uid === skip) continue
    out.push({ task: node.task, depth, parent })
    if (!collapsed.has(node.task.uid)) {
      rowsOf(node.children, collapsed, skip, node.task.uid, depth + 1, out)
    }
  }
  return out
}

const EDGE = 48
const reducedMotion = () => globalThis.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches

/**
 * A list of {@link TaskRow}s with their subtasks indented underneath. A row with subtasks has an
 * expander; the hidden subtasks are the ones the viewer collapsed, so the state is theirs and
 * survives the task list changing underneath it.
 *
 * With `onReorder`, each row has a handle. Dragging it moves the row live to where it would land,
 * the rows around it sliding out of the way; over a row's middle it goes under that row (with
 * `onMoveUnder`). From the keyboard: Space or Enter picks it up, Up and Down move it among its
 * siblings, Right puts it under the task above, Left takes it out of its parent, Space or Enter
 * puts it down and Escape cancels.
 */
export function TaskTree(props: TaskTreeProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(props.collapsed ?? new Set())
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const tops = useRef(new Map<string, number>())
  const counts = new Map<string, number>()
  const dones = new Map<string, number>()
  const byUid = new Map<string, TaskNode>()
  const index = (nodes: readonly TaskNode[]) => {
    for (const node of nodes) {
      counts.set(node.task.uid, descendants(node))
      dones.set(node.task.uid, doneDescendants(node))
      byUid.set(node.task.uid, node)
      index(node.children)
    }
  }
  index(props.nodes)

  const setExpanded = (task: Task, expanded: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (expanded) next.delete(task.uid)
      else next.add(task.uid)
      return next
    })
  }

  const setDrag = (next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }

  // Rows slide to their new places while a drag rearranges them.
  useLayoutEffect(() => {
    const ul = list.current
    if (!ul) return
    const next = new Map<string, number>()
    for (const li of ul.querySelectorAll<HTMLElement>(`:scope > li[data-task-uid]`)) {
      const uid = li.dataset.taskUid!
      next.set(uid, li.offsetTop)
      const before = tops.current.get(uid)
      if (drag && before !== undefined && before !== li.offsetTop && !reducedMotion()) {
        li.animate?.(
          [{ transform: `translateY(${before - li.offsetTop}px)` }, { transform: `none` }],
          { duration: 160, easing: `ease-out` },
        )
      }
    }
    tops.current = next
    if (drag?.keyboard) {
      ul.querySelector<HTMLElement>(
        `li[data-task-uid="${CSS.escape(drag.uid)}"] [data-sortable-handle]`,
      )?.focus()
    }
  })

  if (!props.onReorder) {
    const rows = flattenTree(props.nodes, collapsed)
    return (
      <ul aria-label={props.label} class="flex flex-col" data-e2e="task-tree">
        {rows.map(({ task, depth }) => (
          <TaskRow
            key={task.uid}
            task={task}
            zone={props.zone}
            now={props.now}
            depth={depth}
            list={props.listOf?.(task)}
            subtaskCount={counts.get(task.uid)}
            doneSubtaskCount={dones.get(task.uid)}
            expanded={!collapsed.has(task.uid)}
            onExpandedChange={setExpanded}
            onComplete={props.onComplete}
            onOpen={props.onOpen}
            plain={props.plain}
            onRename={props.onRename}
            onAddSibling={props.onAddSibling}
            onDelete={props.onDelete}
          />
        ))}
      </ul>
    )
  }

  /** The tasks under `parent` (the top level when absent), less the one being dragged. */
  const childrenOf = (parent: string | undefined, without?: string) =>
    (parent ? byUid.get(parent)?.children ?? [] : props.nodes)
      .map((node) => node.task)
      .filter((task) => task.uid !== without)

  const hidden = drag ? new Set([...collapsed, drag.uid]) : collapsed
  const base = rowsOf(props.nodes, hidden, drag?.uid)
  const rows = drag ? withDragged(base, drag) : base

  /** `base` with the dragged task put where its place says. */
  function withDragged(base: Row[], drag: Drag): Row[] {
    const { parent, index } = drag.place
    const parentAt = parent ? base.findIndex((row) => row.task.uid === parent) : -1
    const depth = parent ? base[parentAt].depth + 1 : 0
    const before = childrenOf(parent, drag.uid)[index]
    let at = before ? base.findIndex((row) => row.task.uid === before.uid) : -1
    if (at < 0) {
      at = parentAt + 1
      while (at < base.length && base[at].depth >= depth) at++
    }
    const dragged = { task: byUid.get(drag.uid)!.task, depth, parent }
    return [...base.slice(0, at), dragged, ...base.slice(at)]
  }

  /** Whether `place` is one this tree may move the dragged task to. */
  const allowed = (current: Drag, place: Place) =>
    props.onMoveUnder !== undefined || place.parent === current.from.parent

  const moveTo = (place: Place, into?: string) => {
    const current = dragRef.current
    if (!current || !allowed(current, place)) return
    if (
      current.place.parent === place.parent && current.place.index === place.index &&
      current.into === into
    ) return
    setDrag({ ...current, place, into })
  }

  /** Works out the place under the pointer from the rows as they are drawn now. */
  const hitTest = (y: number) => {
    const current = dragRef.current
    const ul = list.current
    if (!current || !ul) return
    const shown = rowsOf(props.nodes, new Set([...collapsed, current.uid]), current.uid)
    const where = new Map(shown.map((row) => [row.task.uid, row]))
    const items = [...ul.querySelectorAll<HTMLElement>(`:scope > li[data-task-uid]`)]
    const others = items.filter((li) => li.dataset.taskUid !== current.uid)
    if (others.length === 0) return
    for (const li of items) {
      const box = li.getBoundingClientRect()
      if (y < box.top || y >= box.bottom) continue
      const uid = li.dataset.taskUid!
      if (uid === current.uid) return
      const row = where.get(uid)
      if (!row) return
      const siblings = childrenOf(row.parent, current.uid)
      const at = siblings.findIndex((task) => task.uid === uid)
      const share = (y - box.top) / box.height
      const nests = props.onMoveUnder !== undefined
      if (nests && share >= 0.3 && share <= 0.7) {
        return moveTo({ parent: uid, index: childrenOf(uid, current.uid).length }, uid)
      }
      if (share < (nests ? 0.3 : 0.5)) return moveTo({ parent: row.parent, index: at })
      const kids = childrenOf(uid, current.uid)
      if (nests && kids.length > 0 && !collapsed.has(uid)) return moveTo({ parent: uid, index: 0 })
      return moveTo({ parent: row.parent, index: at + 1 })
    }
    const first = others[0].getBoundingClientRect()
    if (y < first.top) return moveTo({ parent: undefined, index: 0 })
    moveTo({ parent: undefined, index: childrenOf(undefined, current.uid).length })
  }

  const finish = (keep: boolean) => {
    const current = dragRef.current
    setDrag(null)
    if (!keep || !current) return
    const { from, place, uid } = current
    if (from.parent === place.parent && from.index === place.index) return
    const task = byUid.get(uid)!.task
    if (from.parent === place.parent) {
      props.onReorder?.(task, childrenOf(from.parent), place.index)
    } else {
      const parent = place.parent ? byUid.get(place.parent)!.task : undefined
      props.onMoveUnder?.(task, parent, childrenOf(place.parent, uid), place.index)
    }
  }

  const start = (task: Task, keyboard: boolean) => {
    const row = base.find((each) => each.task.uid === task.uid)
    const parent = row?.parent
    const from = { parent, index: childrenOf(parent).findIndex((each) => each.uid === task.uid) }
    setDrag({ uid: task.uid, from, place: from, keyboard })
  }

  const onKey = (task: Task, event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (event.key === ` ` || event.key === `Enter`) {
      event.preventDefault()
      if (current?.uid === task.uid) finish(true)
      else start(task, true)
      return
    }
    if (current?.uid !== task.uid) return
    const { parent, index } = current.place
    const siblings = childrenOf(parent, task.uid)
    let next: Place | undefined
    if (event.key === `Escape`) {
      event.preventDefault()
      return finish(false)
    } else if (event.key === `ArrowUp` && index > 0) next = { parent, index: index - 1 }
    else if (event.key === `ArrowDown` && index < siblings.length) {
      next = { parent, index: index + 1 }
    } else if (event.key === `ArrowRight` && index > 0) {
      const above = siblings[index - 1].uid
      next = { parent: above, index: childrenOf(above, task.uid).length }
    } else if (event.key === `ArrowLeft` && parent) {
      const up = rowsOf(props.nodes, new Set(), task.uid).find((row) => row.task.uid === parent)
      const outer = childrenOf(up?.parent, task.uid)
      next = { parent: up?.parent, index: outer.findIndex((each) => each.uid === parent) + 1 }
    }
    if (next) {
      event.preventDefault()
      moveTo(next)
    }
  }

  // A pointer drag follows the pointer anywhere on the page, scrolling near the window's edges.
  const pointerDrag = drag !== null && !drag.keyboard
  useEffect(() => {
    if (!pointerDrag) return
    let y = 0
    let frame = 0
    const scroll = () => {
      const step = y < EDGE ? -12 : y > globalThis.innerHeight - EDGE ? 12 : 0
      if (step) {
        globalThis.scrollBy(0, step)
        hitTest(y)
        frame = requestAnimationFrame(scroll)
      } else frame = 0
    }
    const move = (event: PointerEvent) => {
      y = event.clientY
      hitTest(y)
      if (!frame) frame = requestAnimationFrame(scroll)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => event.key === `Escape` && finish(false)
    globalThis.addEventListener(`pointermove`, move)
    globalThis.addEventListener(`pointerup`, up)
    globalThis.addEventListener(`pointercancel`, cancel)
    globalThis.addEventListener(`keydown`, key)
    return () => {
      cancelAnimationFrame(frame)
      globalThis.removeEventListener(`pointermove`, move)
      globalThis.removeEventListener(`pointerup`, up)
      globalThis.removeEventListener(`pointercancel`, cancel)
      globalThis.removeEventListener(`keydown`, key)
    }
  }, [pointerDrag])

  const dragged = drag ? byUid.get(drag.uid)?.task : undefined
  const target = drag?.into ? byUid.get(drag.into)?.task : undefined
  return (
    <>
      <ul
        ref={list}
        aria-label={props.label}
        class={`flex flex-col ${drag ? `task-dragging` : ``}`}
        data-e2e="task-tree"
      >
        {rows.map(({ task, depth }) => (
          <TaskRow
            key={task.uid}
            task={task}
            zone={props.zone}
            now={props.now}
            depth={depth}
            list={props.listOf?.(task)}
            subtaskCount={counts.get(task.uid)}
            doneSubtaskCount={dones.get(task.uid)}
            expanded={!hidden.has(task.uid)}
            onExpandedChange={setExpanded}
            onComplete={props.onComplete}
            onOpen={props.onOpen}
            plain={props.plain}
            onRename={props.onRename}
            onAddSibling={props.onAddSibling}
            onDelete={props.onDelete}
            lifted={drag?.uid === task.uid}
            dropInto={drag?.into === task.uid}
            handle={
              <button
                type="button"
                data-sortable-handle=""
                class="task-handle relative z-10 inline-flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
                aria-label={`Reorder ${task.title}`}
                aria-pressed={drag?.uid === task.uid}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  start(task, false)
                }}
                onKeyDown={(event) => onKey(task, event)}
              >
                <svg class="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="4" r="1.2" />
                  <circle cx="10" cy="4" r="1.2" />
                  <circle cx="6" cy="8" r="1.2" />
                  <circle cx="10" cy="8" r="1.2" />
                  <circle cx="6" cy="12" r="1.2" />
                  <circle cx="10" cy="12" r="1.2" />
                </svg>
              </button>
            }
          />
        ))}
      </ul>
      <p class="sr-only" aria-live="assertive">
        {dragged
          ? target
            ? `${dragged.title} will go under ${target.title}.`
            : `${dragged.title}, position ${(drag?.place.index ?? 0) + 1}.`
          : ``}
      </p>
    </>
  )
}
