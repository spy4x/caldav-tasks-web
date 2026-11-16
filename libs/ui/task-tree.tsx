import type { JSX } from "preact"
import { useState } from "preact/hooks"
import { flattenTree } from "@spy4x/platform/universal/ical-tasks-view"
import { SortableList } from "@spy4x/preact-ui"
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
   * Turns on drag to reorder, for a list in manual order. Called once per finished move, with the
   * moved task, the tasks that share its parent in the order shown (the moved one included) and
   * the index it takes among the others. Tasks only move among their siblings.
   */
  onReorder?: (task: Task, siblings: readonly Task[], toIndex: number) => void
  /** Quiet rows with no lines between them, as in the Completed section. */
  plain?: boolean
  /** Renames a task in place; see TaskRow's `onRename`. */
  onRename?: (task: Task, title: string) => void
  /** Adds a task beside one, from the line Enter opens while renaming. */
  onAddSibling?: (task: Task, title: string) => void
  /** Deletes a task from its row's hover "Delete". */
  onDelete?: (task: Task) => void
  /** Nests a dragged task under the row it is dropped on; see TaskRow's `onNest`. */
  onNest?: (uid: string, parent: Task) => void
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

/**
 * A list of {@link TaskRow}s with their subtasks indented underneath. A row with subtasks has an
 * expander; the hidden subtasks are the ones the viewer collapsed, so the state is theirs and
 * survives the task list changing underneath it.
 */
export function TaskTree(props: TaskTreeProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(props.collapsed ?? new Set())
  const rows = flattenTree(props.nodes, collapsed)
  const counts = new Map<string, number>()
  const dones = new Map<string, number>()
  const index = (nodes: readonly TaskNode[]) => {
    for (const node of nodes) {
      counts.set(node.task.uid, descendants(node))
      dones.set(node.task.uid, doneDescendants(node))
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

  if (props.onReorder) {
    return (
      <div role="group" aria-label={props.label} data-e2e="task-tree">
        <SortableGroup
          nodes={props.nodes}
          collapsed={collapsed}
          counts={counts}
          dones={dones}
          setExpanded={setExpanded}
          tree={props}
        />
      </div>
    )
  }

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
          onNest={props.onNest}
        />
      ))}
    </ul>
  )
}

interface SortableGroupProps {
  nodes: readonly TaskNode[]
  collapsed: ReadonlySet<string>
  counts: ReadonlyMap<string, number>
  dones: ReadonlyMap<string, number>
  setExpanded: (task: Task, expanded: boolean) => void
  tree: TaskTreeProps
  /** How deep this group's tasks sit; 0 for the top level. */
  depth?: number
}

/**
 * The tasks that share a parent as a {@link SortableList}; a task with subtasks holds its own
 * group under its row. Each group reorders on its own, so a task never changes parent.
 */
function SortableGroup(props: SortableGroupProps): JSX.Element {
  const { nodes, tree } = props
  const siblings = nodes.map((node) => node.task)
  return (
    <SortableList
      class={props.depth ? `task-sortable` : `task-sortable task-sortable-top`}
      items={nodes.map((node) => ({ id: node.task.uid, node }))}
      itemLabel={({ node }) => node.task.title}
      onMove={(from, to) => tree.onReorder?.(siblings[from], siblings, to)}
      renderItem={({ node }) => {
        const { task } = node
        const open = !props.collapsed.has(task.uid)
        return (
          <>
            <TaskRow
              bare
              task={task}
              depth={props.depth ?? 0}
              zone={tree.zone}
              now={tree.now}
              list={tree.listOf?.(task)}
              subtaskCount={props.counts.get(task.uid)}
              doneSubtaskCount={props.dones.get(task.uid)}
              expanded={open}
              onExpandedChange={props.setExpanded}
              onComplete={tree.onComplete}
              onOpen={tree.onOpen}
              onRename={tree.onRename}
              onAddSibling={tree.onAddSibling}
              onDelete={tree.onDelete}
              onNest={tree.onNest}
            />
            {open && node.children.length > 0 && (
              <SortableGroup {...props} nodes={node.children} depth={(props.depth ?? 0) + 1} />
            )}
          </>
        )
      }}
    />
  )
}
