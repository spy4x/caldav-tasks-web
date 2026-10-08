/**
 * The subtask tree of a list. Every task in the input appears exactly once in the output, whatever
 * its links say: a task whose parent is missing is shown at the top, and a cycle is cut open.
 */

import type { Task, TaskNode } from "./types.ts"

/**
 * Nests each task under its parent (`parentUid`). Siblings keep the order they have in `tasks`, so
 * sort first to order a tree.
 *
 * - A task with no parent, a parent that is not in `tasks`, or itself as parent is at the top.
 * - A cycle (A under B under A) is cut at the member that comes first in `tasks`, which goes to
 *   the top with the rest of the cycle below it.
 * - When two tasks share a `UID`, children attach to the first; the second is shown at the top.
 */
export function buildTree(tasks: readonly Task[]): TaskNode[] {
  const indexOfUid = new Map<string, number>()
  tasks.forEach((task, index) => {
    if (!indexOfUid.has(task.uid)) indexOfUid.set(task.uid, index)
  })
  const parent = tasks.map((task, index) => {
    if (task.parentUid === undefined) return -1
    const found = indexOfUid.get(task.parentUid)
    return found === undefined || found === index ? -1 : found
  })

  cutCycles(parent)

  const nodes: TaskNode[] = tasks.map((task) => ({ task, children: [] }))
  const roots: TaskNode[] = []
  nodes.forEach((node, index) => {
    if (parent[index] === -1) roots.push(node)
    else nodes[parent[index]].children.push(node)
  })
  return roots
}

/** Sets the parent of one member of every cycle to -1. Changes `parent`. */
function cutCycles(parent: number[]): void {
  // 0 not seen, 1 on the path being walked, 2 known to reach the top
  const state = parent.map(() => 0)
  for (let start = 0; start < parent.length; start++) {
    const path: number[] = []
    let at = start
    while (at !== -1 && state[at] === 0) {
      state[at] = 1
      path.push(at)
      at = parent[at]
    }
    if (at !== -1 && state[at] === 1) {
      const cycle = path.slice(path.indexOf(at))
      parent[Math.min(...cycle)] = -1
    }
    for (const index of path) state[index] = 2
  }
}

/** A task and how deep it sits, for a screen that draws the tree as indented rows. */
export interface TreeRow {
  task: Task
  depth: number
}

/**
 * The tree as rows, parents before their children. A node whose `UID` is in `collapsed` hides its
 * descendants.
 */
export function flattenTree(
  nodes: readonly TaskNode[],
  collapsed: ReadonlySet<string> = new Set(),
): TreeRow[] {
  const rows: TreeRow[] = []
  const visit = (list: readonly TaskNode[], depth: number) => {
    for (const node of list) {
      rows.push({ task: node.task, depth })
      if (!collapsed.has(node.task.uid)) visit(node.children, depth + 1)
    }
  }
  visit(nodes, 0)
  return rows
}
