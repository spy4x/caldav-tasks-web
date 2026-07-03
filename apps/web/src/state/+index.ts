import { computed, effect, signal } from "@preact/signals"
import type { CalendarCollection, TodoItem } from "@shared/types"

export interface User {
  id: number
  email: string
  firstName?: string
  secondName?: string
  role?: number
  username?: string
}
export interface Server {
  id: number
  name: string
  serverType: number
  baseUrl: string
  username: string
  password: string
  calendarPath: string | null
}

// ─── Auth ─────────────────────────────────────────────────────────────────
export const user = signal<User | null>(null)
export const isAuthenticated = computed(() => user.value !== null)

// ─── Servers & Collections ───────────────────────────────────────────────
export const servers = signal<(Server & { password?: string })[]>([])
export const collections = signal<(CalendarCollection & { color?: string })[]>([])
export const selectedCollection = signal<string | null>(null)
export const selectedServerId = signal<number | null>(null)
export const sidebarOpen = signal(
  typeof globalThis !== "undefined" && globalThis.localStorage
    ? localStorage.getItem("sidebar_collapsed") !== "true"
    : true,
)

export const selectedServer = computed(() => {
  if (!selectedServerId.value) return null
  return servers.value.find((s) => s.id === selectedServerId.value) || null
})

// Tags extracted from all todos, indexed by server
export const serverTags = signal<Record<number, string[]>>({})

// Todos data
export const allTodos = signal<TodoItem[]>([])
export const allTodosByCollection = signal<Record<string, TodoItem[]>>({})
export const loading = signal(false)
export const loadingCollections = signal(false)
export const error = signal<string | null>(null)

// ─── Filters & Search ────────────────────────────────────────────────────
export const searchQuery = signal("")
export const searchScope = signal<"collection" | "server">("collection")
export const showCompleted = signal(false)
export const filterStatus = signal<number | null>(null)
export const filterPriority = signal<number | null>(null)
export const filterTags = signal<string[]>([])

// Multi-sort: array of { field, asc }
export type SortField = "priority" | "status" | "due" | "created" | "summary"
export interface SortRule {
  field: SortField
  asc: boolean
}
export const sortRules = signal<SortRule[]>([{ field: "priority", asc: false }])

// ─── UI State ────────────────────────────────────────────────────────────
export const showEditDialog = signal(false)
export const editingTodo = signal<TodoItem | null>(null)
export const creatingTodo = signal(false)
export const showHotkeys = signal(false)
export const showDeleteConfirm = signal<
  {
    type: string
    id: string
    name: string
    onConfirm: () => Promise<void>
  } | null
>(null)

// ─── View Mode ─────────────────────────────────────────────────────────────
export type ViewMode = "list" | "kanban"
export const viewMode = signal<ViewMode>("list")

// ─── URL State Sync ──────────────────────────────────────────────────────
// Read URL params on init and sync back
if (typeof globalThis !== "undefined" && globalThis.location) {
  const params = new URLSearchParams(globalThis.location.search)
  const col = params.get("col")
  const sid = params.get("sid")
  const q = params.get("q")
  const scope = params.get("scope")
  const st = params.get("st")
  const pr = params.get("pr")
  const done = params.get("done")
  const sort = params.get("sort")

  if (col) selectedCollection.value = col
  if (sid) selectedServerId.value = parseInt(sid)
  if (q) searchQuery.value = q
  if (scope === "server" || scope === "collection") searchScope.value = scope
  if (st) filterStatus.value = parseInt(st)
  if (pr) filterPriority.value = parseInt(pr)
  if (done === "0") showCompleted.value = false
  if (sort) {
    try {
      sortRules.value = JSON.parse(sort)
    } catch {}
  }
}

// Sync state back to URL
effect(() => {
  if (typeof globalThis === "undefined" || !globalThis.history) return
  const params = new URLSearchParams()
  if (selectedCollection.value) params.set("col", selectedCollection.value)
  if (selectedServerId.value) params.set("sid", String(selectedServerId.value))
  if (searchQuery.value) params.set("q", searchQuery.value)
  if (searchScope.value !== "collection") params.set("scope", searchScope.value)
  if (filterStatus.value !== null) params.set("st", String(filterStatus.value))
  if (filterPriority.value !== null) params.set("pr", String(filterPriority.value))
  if (!showCompleted.value) params.set("done", "0")
  if (sortRules.value.length > 0 && sortRules.value[0].field !== "priority") {
    params.set("sort", JSON.stringify(sortRules.value))
  }
  const qs = params.toString()
  const url = qs ? `${globalThis.location.pathname}?${qs}` : globalThis.location.pathname
  globalThis.history.replaceState(null, "", url)
})

// ─── Filtered & Sorted Todos ─────────────────────────────────────────────
export const filteredTodos = computed(() => {
  let todos = allTodos.value

  // By collection
  if (selectedCollection.value && searchScope.value === "collection") {
    todos = todos.filter((t) => t.collectionHref === selectedCollection.value)
  }

  // Search
  const query = searchQuery.value.toLowerCase().trim()
  if (query) {
    todos = todos.filter((t) =>
      t.summary.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.categories.some((c) => c.toLowerCase().includes(query))
    )
  }

  // Status
  if (filterStatus.value !== null) todos = todos.filter((t) => t.status === filterStatus.value)
  if (!showCompleted.value) todos = todos.filter((t) => t.status !== 3)

  // Priority
  if (filterPriority.value !== null) {
    if (filterPriority.value === 0) todos = todos.filter((t) => t.priority === 0)
    else todos = todos.filter((t) => t.priority === filterPriority.value)
  }

  // Tags
  if (filterTags.value.length > 0) {
    todos = todos.filter((t) => filterTags.value.some((tag) => t.categories.includes(tag)))
  }

  // Multi-sort
  const rules = sortRules.value
  if (rules.length > 0) {
    todos = [...todos].sort((a, b) => {
      for (const rule of rules) {
        let cmp = 0
        if (rule.field === "priority") {
          const pa = a.priority === 0 ? (rule.asc ? 0 : 999) : (a.priority || 0)
          const pb = b.priority === 0 ? (rule.asc ? 0 : 999) : (b.priority || 0)
          cmp = pb - pa
        } else if (rule.field === "status") cmp = (a.status || 0) - (b.status || 0)
        else if (rule.field === "due") {
          const da = a.due ? new Date(a.due).getTime() : Infinity
          const db = b.due ? new Date(b.due).getTime() : Infinity
          cmp = da - db
        } else if (rule.field === "summary") cmp = a.summary.localeCompare(b.summary)
        if (cmp !== 0) return rule.asc ? cmp : -cmp
      }
      return 0
    })
  }

  return todos
})

// ─── Undone Count Per Collection ─────────────────────────────────────────
export const undoneCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const t of allTodos.value) {
    if (t.status === 3) continue
    const key = t.collectionHref
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
})

// ─── Helpers ──────────────────────────────────────────────────────────────
export function getDisplayName(user: User | null): string {
  if (!user) return ""
  if (user.firstName || user.secondName) {
    return `${user.firstName || ""} ${user.secondName || ""}`.trim()
  }
  return user.email || user.username || ""
}
