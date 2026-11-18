import type { Task } from "@spy4x/time/ical-tasks-model"
import { toasts } from "../state/toasts.ts"
import { savedTasks, shownAhead } from "../state/task-store.ts"
import { addTask, deleteTaskTree, restoreTask } from "../state/task-writes.ts"
import { type ReorderWrite, reorderWrites } from "@tasks/reorder.ts"
import { findCalendar } from "../state/calendars.ts"
import { loadCompleted } from "../state/sync.ts"
import {
  saveTask,
  setTaskDone,
  setTaskParent,
  tasks,
  undoWrite,
  WriteKind,
  type WriteResult,
} from "../state/tasks.ts"

const NO_HEADING = ``

/** Shows why a write did not go through. Resolves `true` when it was saved. */
function reportFailure(result: WriteResult): boolean {
  switch (result.kind) {
    case WriteKind.Saved:
      return true
    case WriteKind.Conflict:
      toasts.error({
        title: NO_HEADING,
        body: `The task changed elsewhere. Open it and try again.`,
      })
      return false
    case WriteKind.Failed:
      toasts.error({ title: NO_HEADING, body: result.message })
      return false
  }
}

/** Runs an undo and says how it went. */
async function undo(run: () => Promise<WriteResult>, done: string): Promise<void> {
  if (reportFailure(await run())) toasts.success({ title: NO_HEADING, body: done })
}

/**
 * Completes or reopens a task and offers Undo in a toast. Undo writes the text from before over
 * the saved copy, and says so when the task changed elsewhere in between instead of overwriting it.
 */
export async function completeWithUndo(task: Task, done: boolean): Promise<void> {
  const result = await setTaskDone(task, done)
  if (!reportFailure(result) || result.kind !== WriteKind.Saved) return
  const saved = result.task
  toasts.success({
    title: NO_HEADING,
    body: done ? `Completed "${task.title}"` : `Reopened "${task.title}"`,
    action: {
      label: `Undo`,
      onAction: () => undo(() => undoWrite(saved, task.ics), `Undone`),
    },
  })
}

/**
 * Loads the completed tasks of the list `task` is in, unless the device has them. A completed
 * subtask is a subtask: the delete question counts it and the delete takes it, so both need it in
 * the cache. Offline it stays unknown.
 */
export async function loadHiddenSubtasks(task: Task): Promise<void> {
  if (findCalendar(task.listHref)?.completedLoaded === false) await loadCompleted(task.listHref)
}

/** Puts deleted tasks back one after another, a task before its subtasks. Stops at a failure. */
async function restoreAll(deleted: readonly Task[]): Promise<WriteResult> {
  let result = await restoreTask(deleted[0])
  for (const task of deleted.slice(1)) {
    if (result.kind !== WriteKind.Saved) return result
    result = await restoreTask(task)
  }
  return result
}

/**
 * Deletes a task with every subtask under it and offers Undo in a toast. Undo creates them again
 * from the text they had. Resolves `true` when the task itself is gone, so the caller can leave its
 * page; a subtask the server refused to delete is named in a second toast.
 */
export async function deleteWithUndo(task: Task): Promise<boolean> {
  await loadHiddenSubtasks(task)
  const { result, deleted } = await deleteTaskTree(task)
  const whole = reportFailure(result)
  if (deleted.length === 0) return false
  const gone = deleted[0].uid === task.uid
  const under = deleted.length - 1
  toasts.success({
    title: NO_HEADING,
    body: !gone
      ? `Deleted ${deleted.length} of the subtasks of "${task.title}"`
      : under === 0
      ? `Deleted "${task.title}"`
      : `Deleted "${task.title}" and its ${under === 1 ? `subtask` : `${under} subtasks`}`,
    action: {
      label: `Undo`,
      onAction: () => undo(() => restoreAll(deleted), `Restored`),
    },
  })
  return whole || gone
}

/** The toast for a failed write during a drag: the order may be half changed, so say so. */
function reportReorderFailure(result: WriteResult): boolean {
  if (result.kind === WriteKind.Saved) return true
  toasts.error({
    title: NO_HEADING,
    body: result.kind === WriteKind.Conflict
      ? `Could not save the new order: a task changed elsewhere. Check the list and drag again.`
      : `Could not save the new order: ${result.message}`,
  })
  return false
}

/** Shows `changes` at once while `write` runs; the saved copies take over when it ends. */
async function showingAhead<T>(
  changes: ReadonlyMap<string, Partial<Task>>,
  write: () => Promise<T>,
): Promise<T> {
  shownAhead.value = new Map([...shownAhead.value, ...changes])
  try {
    return await write()
  } finally {
    const rest = new Map(shownAhead.value)
    for (const uid of changes.keys()) rest.delete(uid)
    shownAhead.value = rest
  }
}

/** The new positions of `writes`, as changes to show ahead. */
function positions(writes: ReorderWrite[], into = new Map<string, Partial<Task>>()) {
  for (const { task, edit } of writes) {
    into.set(task.uid, { ...into.get(task.uid), sortOrder: edit.sortOrder ?? undefined })
  }
  return into
}

const listTasks = (listHref: string) => savedTasks().filter((each) => each.listHref === listHref)

/**
 * Moves a task to `toIndex` among the `visible` siblings in manual order, in the list `listHref`.
 * The new order shows at once. Every loaded task of the list counts, so hidden siblings keep their
 * place; before the first drag in a list, its completed tasks are loaded too, as "Show completed"
 * loads them. Writes the fewest tasks that keep the order (the moved one, a neighbour, or a few
 * spread out), one after another. Failures show a toast; a failure after the first write leaves
 * the earlier ones saved. Resolves `true` when every write was saved.
 */
export async function reorderInList(
  listHref: string,
  task: Task,
  visible: readonly Task[],
  toIndex: number,
  zone: string,
): Promise<boolean> {
  const writes = (all: readonly Task[]) => reorderWrites(all, visible, task.uid, toIndex, zone)
  return await showingAhead(positions(writes(listTasks(listHref))), async () => {
    if (findCalendar(listHref)?.completedLoaded === false) await loadCompleted(listHref)
    for (const write of writes(listTasks(listHref))) {
      if (!reportReorderFailure(await saveTask(write.task, write.edit))) return false
    }
    return true
  })
}

/** Whether `parent` is `task` or sits under it, at any depth: nesting there would make a loop. */
export function isWithin(parent: Task, task: Task, all: readonly Task[]): boolean {
  const byUid = new Map(all.map((each) => [each.uid, each]))
  const seen = new Set<string>()
  for (
    let at: Task | undefined = parent;
    at && !seen.has(at.uid);
    at = byUid.get(at.parentUid ?? ``)
  ) {
    if (at.uid === task.uid) return true
    seen.add(at.uid)
  }
  return false
}

/**
 * Moves `task` under `parent` (the top level when `undefined`), at `toIndex` among `siblings`, its
 * new siblings in the order shown. Shows the move at once, then writes the new parent and the
 * position. Refused under one of its own subtasks or in another list. Offers Undo, which puts it
 * back under its old parent.
 */
export async function moveUnder(
  listHref: string,
  task: Task,
  parent: Task | undefined,
  siblings: readonly Task[],
  toIndex: number,
  zone: string,
): Promise<void> {
  if (task.listHref !== listHref || (parent && parent.listHref !== listHref)) return
  if (parent && isWithin(parent, task, tasks.value)) {
    if (parent.uid !== task.uid) {
      toasts.error({ title: NO_HEADING, body: `A task can't go under one of its own subtasks.` })
    }
    return
  }
  const before = task.parentUid
  const moved = (all: readonly Task[]) =>
    all.map((each) => each.uid === task.uid ? { ...each, parentUid: parent?.uid } : each)
  const visible = [...siblings.slice(0, toIndex), task, ...siblings.slice(toIndex)]
  const order = reorderWrites(moved(listTasks(listHref)), visible, task.uid, toIndex, zone)
  const ahead = positions(order, new Map([[task.uid, { parentUid: parent?.uid }]]))
  const saved = await showingAhead(ahead, async () => {
    const result = await setTaskParent(task, parent?.uid)
    if (!reportFailure(result) || result.kind !== WriteKind.Saved) return false
    for (const write of order) {
      const base = write.task.uid === task.uid ? result.task : write.task
      if (!reportReorderFailure(await saveTask(base, write.edit))) break
    }
    return true
  })
  if (!saved) return
  toasts.success({
    title: NO_HEADING,
    body: parent
      ? `Moved "${task.title}" under "${parent.title}"`
      : `Moved "${task.title}" out to the top level`,
    action: {
      label: `Undo`,
      onAction: () => {
        const now = tasks.value.find((each) => each.uid === task.uid) ?? task
        return undo(() => setTaskParent(now, before), `Moved back`)
      },
    },
  })
}

/** Saves a title typed into a row, and says why when it could not be saved. */
export async function renameTask(task: Task, title: string): Promise<void> {
  const result = await saveTask(task, { title })
  if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
  else if (result.kind === WriteKind.Conflict) {
    toasts.warning({
      title: ``,
      body: `This task was changed elsewhere. Open it to choose which version to keep.`,
    })
  }
}

/**
 * Adds a task beside `task`: in its list, under its parent when it is a subtask. Resolves to the
 * new task's UID, or `undefined` when it could not be added.
 */
export async function addSiblingTask(task: Task, title: string): Promise<string | undefined> {
  const parent = task.parentUid
    ? tasks.value.find((candidate) => candidate.uid === task.parentUid)
    : undefined
  const result = await addTask({ title }, { listHref: task.listHref, parent })
  if (result.kind === WriteKind.Failed) toasts.error({ title: ``, body: result.message })
  return result.kind === WriteKind.Saved ? result.task.uid : undefined
}
