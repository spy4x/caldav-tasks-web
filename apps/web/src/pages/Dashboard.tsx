import { useEffect } from "preact/hooks"
import {
  allTodos,
  collections,
  creatingTodo,
  editingTodo,
  error,
  filteredTodos,
  loading,
  searchQuery,
  selectedCollection,
  selectedServerId,
  servers,
  showCompleted,
  showDeleteConfirm,
  showEditDialog,
  sidebarOpen,
  viewMode,
} from "../state/+index.ts"
import { api } from "../lib/api.ts"
import { TodoItem } from "../components/TodoItem.tsx"
import { TodoEditDialog } from "../components/TodoEditDialog.tsx"
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog.tsx"
import { LoadingSpinner } from "../components/LoadingSpinner.tsx"

export function DashboardPage() {
  useEffect(() => {
    api.listServers().then((data) => {
      servers.value = data.servers
    }).catch(() => {})
  }, [])

  // Fetch todos when collection changes
  useEffect(() => {
    if (!selectedCollection.value || !selectedServerId.value) {
      allTodos.value = []
      return
    }
    loading.value = true
    error.value = null
    api.listTodos(selectedServerId.value, selectedCollection.value)
      .then((data) => {
        allTodos.value = data.todos
      })
      .catch((err) => {
        error.value = err.message
      })
      .finally(() => {
        loading.value = false
      })
  }, [selectedCollection.value, selectedServerId.value])

  const openNewTodo = () => {
    editingTodo.value = null
    creatingTodo.value = true
    showEditDialog.value = true
  }

  const handleToggle = async (todo: any) => {
    if (!selectedServerId.value) return
    const newStatus = todo.status === 3 ? 1 : 3
    try {
      await api.updateTodo(selectedServerId.value, todo.uid, {
        status: newStatus,
        etag: todo.etag,
        path: selectedCollection.value || undefined,
        href: todo.href,
      })
      allTodos.value = allTodos.value.map((t: any) =>
        t.uid === todo.uid ? { ...t, status: newStatus } : t
      )
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  const handleStatusChange = async (todo: any, newStatus: number) => {
    if (!selectedServerId.value || todo.status === newStatus) return
    try {
      await api.updateTodo(selectedServerId.value, todo.uid, {
        status: newStatus as any,
        etag: todo.etag,
        path: selectedCollection.value || undefined,
        href: todo.href,
      })
      allTodos.value = allTodos.value.map((t: any) =>
        t.uid === todo.uid ? { ...t, status: newStatus } : t
      )
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  const handleEdit = (todo: any) => {
    creatingTodo.value = false
    editingTodo.value = todo
    showEditDialog.value = true
  }

  // No server configured
  if (servers.value.length === 0) {
    return (
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p class="text-slate-400 mb-4 text-sm">No CalDAV servers configured.</p>
          <a
            href="/settings"
            class="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Add a server
          </a>
        </div>
      </div>
    )
  }

  // Get current collection display name
  const currentCol = selectedCollection.value
    ? collections.value.find((c) => c.href === selectedCollection.value)
    : null
  const colDisplayName = currentCol?.displayName ||
    selectedCollection.value?.split("/").filter(Boolean).pop() || ""

  return (
    <div
      class={`p-3 md:p-5 ${
        viewMode.value === "kanban" ? "max-w-full" : "max-w-3xl"
      } mx-auto space-y-4`}
    >
      {/* Header bar */}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          {currentCol?.color && (
            <span
              class="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: currentCol.color }}
            />
          )}
          <h2 class="text-lg font-bold text-white truncate">{colDisplayName || "Todos"}</h2>
          {!loading.value && allTodos.value.length > 0 && (
            <span class="text-xs text-slate-500">({allTodos.value.length})</span>
          )}
        </div>
        <div class="flex items-center gap-2">
          {/* View toggle */}
          <button
            onClick={() => viewMode.value = viewMode.value === "list" ? "kanban" : "list"}
            class="text-xs px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
            title={viewMode.value === "list" ? "Kanban view" : "List view"}
          >
            {viewMode.value === "list"
              ? (
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                  />
                </svg>
              )
              : (
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
              )}
            <span class="hidden sm:inline">{viewMode.value === "list" ? "Kanban" : "List"}</span>
          </button>
          {selectedCollection.value && (
            <button
              data-add
              onClick={openNewTodo}
              class="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span class="hidden sm:inline">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* No collection selected */}
      {!selectedCollection.value && (
        <div class="text-center py-12">
          <p class="text-slate-500 mb-4">Select a collection from the sidebar to view todos</p>
          <button
            onClick={() => sidebarOpen.value = true}
            class="md:hidden px-4 py-2 rounded-lg bg-blue-600 text-white text-sm cursor-pointer"
          >
            Browse collections
          </button>
        </div>
      )}

      {/* Error */}
      {error.value && (
        <div class="bg-red-900/40 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300 flex items-center justify-between">
          <span>{error.value}</span>
          <button
            onClick={() => error.value = null}
            class="text-red-400 hover:text-red-200 cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading */}
      {loading.value && <LoadingSpinner text="Loading todos..." />}

      {/* Search info */}
      {searchQuery.value && !loading.value && (
        <p class="text-xs text-slate-500">
          Search: "{searchQuery.value}" — {filteredTodos.value.length}{" "}
          result{filteredTodos.value.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ─── LIST VIEW ──────────────────────────────────────────────── */}
      {!loading.value && filteredTodos.value.length > 0 && viewMode.value === "list" && (
        <div class="space-y-1.5">
          {filteredTodos.value.filter((t) => t.status !== 3).map((todo) => (
            <TodoItem
              key={todo.uid}
              todo={todo}
              onToggle={() => handleToggle(todo)}
              onClick={() => handleEdit(todo)}
            />
          ))}
          {filteredTodos.value.filter((t) => t.status === 3).length > 0 && (
            <>
              <div class="pt-2">
                <button
                  onClick={() => showCompleted.value = !showCompleted.value}
                  class="w-full flex items-center gap-2 text-left cursor-pointer group"
                >
                  <div class="flex-1 border-t border-slate-700/50" />
                  <span class="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors shrink-0 flex items-center gap-1">
                    Completed ({filteredTodos.value.filter((t) => t.status === 3).length})
                    <span
                      class={`inline-block transition-transform duration-200 ${
                        showCompleted.value ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                  </span>
                  <div class="flex-1 border-t border-slate-700/50" />
                </button>
              </div>
              {showCompleted.value && filteredTodos.value.filter((t) =>
                t.status === 3
              ).map((todo) => (
                <TodoItem
                  key={todo.uid}
                  todo={todo}
                  onToggle={() => handleToggle(todo)}
                  onClick={() => handleEdit(todo)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── KANBAN VIEW ─────────────────────────────────────────────── */}
      {!loading.value && allTodos.value.length > 0 && viewMode.value === "kanban" && (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { status: 1, label: "Needs Action", color: "border-blue-500/30 bg-blue-500/5" },
            { status: 2, label: "In Progress", color: "border-amber-500/30 bg-amber-500/5" },
            { status: 3, label: "Completed", color: "border-green-500/30 bg-green-500/5" },
            { status: 4, label: "Cancelled", color: "border-slate-500/30 bg-slate-500/5" },
          ].map((col) => {
            const todos = allTodos.value.filter((t) => t.status === col.status)
            return (
              <div
                key={col.status}
                class={`rounded-lg border ${col.color} p-2 min-h-[120px]`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const uid = e.dataTransfer!.getData("text/uid")
                  if (!uid) return
                  const todo = allTodos.value.find((t) => t.uid === uid)
                  if (!todo || todo.status === col.status) {
                    return
                  }
                  handleStatusChange(todo, col.status)
                }}
              >
                <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                  {col.label}
                  <span class="text-slate-600 font-normal ml-1">({todos.length})</span>
                </div>
                <div class="space-y-1.5">
                  {todos.map((todo) => (
                    <div
                      key={todo.uid}
                      draggable
                      onDragStart={(e) => e.dataTransfer!.setData("text/uid", todo.uid)}
                      onClick={() => handleEdit(todo)}
                      class="bg-slate-800/80 rounded px-2.5 py-2 text-xs text-slate-200 cursor-pointer border border-slate-700/50 hover:border-slate-600 transition-colors"
                    >
                      <div class="flex items-start gap-1.5">
                        {todo.priority > 0 && (
                          <span
                            class={`shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${
                              todo.priority <= 2
                                ? "bg-red-500"
                                : todo.priority <= 4
                                ? "bg-amber-500"
                                : "bg-slate-500"
                            }`}
                          />
                        )}
                        <span class="flex-1 leading-tight">{todo.summary}</span>
                      </div>
                      {todo.categories.length > 0 && (
                        <div class="flex flex-wrap gap-1 mt-1.5">
                          {todo.categories.slice(0, 3).map((cat) => (
                            <span
                              key={cat}
                              class="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty */}
      {!loading.value && filteredTodos.value.length === 0 && selectedCollection.value &&
        !searchQuery.value && (
        <div class="text-center py-12 text-slate-500 text-sm">No todos yet.</div>
      )}
      {!loading.value && filteredTodos.value.length === 0 && searchQuery.value && (
        <div class="text-center py-12 text-slate-500 text-sm">No todos match your search.</div>
      )}

      <TodoEditDialog />
      <DeleteConfirmDialog />
    </div>
  )
}
