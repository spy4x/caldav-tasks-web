import { useEffect, useState } from "preact/hooks"
import {
  collections,
  filterPriority,
  filterStatus,
  filterTags,
  loadingCollections,
  searchQuery,
  searchScope,
  selectedCollection,
  selectedServerId,
  servers,
  serverTags,
  showCompleted,
  sidebarOpen,
  sortRules,
  undoneCounts,
} from "../state/+index.ts"
import type { SortField, SortRule } from "../state/+index.ts"
import { api } from "../lib/api.ts"

export function Sidebar() {
  useEffect(() => {
    loadCollections()
  }, [servers.value])

  const loadCollections = async () => {
    loadingCollections.value = true
    collections.value = []
    for (const s of servers.value) {
      try {
        const data = await api.getCalendars(s.id)
        for (const cal of data.calendars) {
          const color = (cal as any).color || ""
          collections.value = [...collections.value, { ...cal, color, serverId: s.id }]
        }
      } catch { /* skip */ }
    }
    // Auto-select first collection if none selected
    if (!selectedCollection.value && collections.value.length > 0) {
      selectedServerId.value = collections.value[0].serverId
      selectedCollection.value = collections.value[0].href
    }
    loadingCollections.value = false
  }

  const selectCollection = (serverId: number, href: string) => {
    selectedServerId.value = serverId
    selectedCollection.value = selectedCollection.value === href ? null : href
    sidebarOpen.value = false
  }

  // ─── Inline CRUD state ──────────────────────────────────────────────
  const [renamingCol, setRenamingCol] = useState<Record<string, boolean>>({})
  const [renameVal, setRenameVal] = useState<Record<string, string>>({})
  const [newColServer, setNewColServer] = useState<number | null>(null)
  const [newColName, setNewColName] = useState("")
  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<
    { serverId: number; href: string; name: string } | null
  >(null)

  const handleRename = async (serverId: number, href: string) => {
    const name = renameVal[href]?.trim()
    if (!name) return
    try {
      await api.updateCollection(serverId, href, name)
      // Refresh collections
      const data = await api.getCalendars(serverId)
      for (const cal of data.calendars) {
        const color = (cal as any).color || ""
        collections.value = collections.value.map((c) =>
          c.href === cal.href ? { ...c, displayName: cal.displayName, color } : c
        )
      }
      setRenamingCol({ ...renamingCol, [href]: false })
    } catch (err) { /* ignore */ }
  }

  const handleDeleteCol = async (serverId: number, href: string) => {
    const col = collections.value.find((c) => c.href === href)
    setConfirmDelete({
      serverId,
      href,
      name: col?.displayName || href.split("/").filter(Boolean).pop() || "this collection",
    })
  }

  const executeDeleteCol = async (serverId: number, href: string) => {
    setConfirmDelete(null)
    try {
      await api.deleteCollection(serverId, href)
      collections.value = collections.value.filter((c) => c.href !== href)
      if (selectedCollection.value === href) selectedCollection.value = null
    } catch (err) { /* ignore */ }
  }

  const handleCreateCol = async (serverId: number) => {
    const name = newColName.trim()
    if (!name) return
    try {
      await api.createCollection(serverId, name)
      setNewColName("")
      setNewColServer(null)
      const data = await api.getCalendars(serverId)
      for (const cal of data.calendars) {
        const color = (cal as any).color || ""
        if (!collections.value.find((c) => c.href === cal.href)) {
          collections.value = [...collections.value, { ...cal, color, serverId }]
        }
      }
    } catch (err) { /* ignore */ }
  }

  const addSortRule = () => {
    sortRules.value = [...sortRules.value, { field: "priority" as SortField, asc: false }]
  }
  const updateSortRule = (idx: number, rule: SortRule) => {
    const next = [...sortRules.value]
    next[idx] = rule
    sortRules.value = next
  }
  const removeSortRule = (idx: number) => {
    sortRules.value = sortRules.value.filter((_, i) => i !== idx)
  }

  return (
    <>
      {sidebarOpen.value && (
        <div
          class="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => sidebarOpen.value = false}
        />
      )}

      <aside
        class={`fixed md:sticky top-0 bottom-0 left-0 z-40 bg-slate-800 border-r border-slate-700 overflow-y-auto transition-all duration-200 ${
          sidebarOpen.value
            ? "translate-x-0 w-72"
            : "-translate-x-full w-72 md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0"
        }`}
      >
        {/* Close button (mobile + desktop) */}
        <button
          onClick={() => {
            sidebarOpen.value = false
            localStorage.setItem("sidebar_collapsed", "true")
          }}
          class="absolute top-2 right-2 z-50 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer text-lg"
        >
          ✕
        </button>

        <div class={`p-3 space-y-4 ${sidebarOpen.value ? "" : "hidden md:hidden"}`}>
          {/* ─── Search at top ─────────────────────────────────────────── */}
          <div class="relative">
            <svg
              class="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              data-search
              type="text"
              placeholder="Search todos... (s)"
              value={searchQuery.value}
              onInput={(e) => searchQuery.value = (e.target as HTMLInputElement).value}
              class="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Search scope — only show when searching */}
          {searchQuery.value.length > 0 && (
            <div class="flex gap-1 -mt-2">
              <button
                onClick={() => searchScope.value = "collection"}
                class={`text-[10px] px-2 py-0.5 rounded-full cursor-pointer ${
                  searchScope.value === "collection"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                This collection
              </button>
              <button
                onClick={() => searchScope.value = "server"}
                class={`text-[10px] px-2 py-0.5 rounded-full cursor-pointer ${
                  searchScope.value === "server"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                All collections
              </button>
            </div>
          )}

          {/* ─── Filters ──────────────────────────────────────────────── */}
          <div>
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Filters
            </h3>
            <div class="space-y-2">
              <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCompleted.value}
                  onChange={(e) => showCompleted.value = (e.target as HTMLInputElement).checked}
                  class="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                />
                Show completed <span class="text-slate-600">(collapsed)</span>
              </label>

              <select
                value={filterStatus.value ?? ""}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value
                  filterStatus.value = v ? parseInt(v) : null
                }}
                class="w-full px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">All statuses</option>
                <option value="1">Needs Action</option>
                <option value="2">In Progress</option>
                <option value="3">Completed</option>
                <option value="4">Cancelled</option>
              </select>

              <select
                value={filterPriority.value ?? ""}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value
                  filterPriority.value = v === "" ? null : parseInt(v)
                }}
                class="w-full px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">All priorities</option>
                <option value="0">No priority</option>
                <option value="1">🔴 Highest</option>
                <option value="2">🟠 High</option>
                <option value="3">🟡 Medium-High</option>
                <option value="4">🟢 Medium</option>
                <option value="5">🔵 Medium-Low</option>
                <option value="9">⚪ Low</option>
              </select>
            </div>
          </div>

          {/* ─── Sort (multi) ──────────────────────────────────────────── */}
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort</h3>
              <button
                onClick={addSortRule}
                class="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                + Add level
              </button>
            </div>
            <div class="space-y-1">
              {sortRules.value.map((rule, idx) => (
                <div key={idx} class="flex gap-1 items-center">
                  <select
                    value={rule.field}
                    onChange={(e) =>
                      updateSortRule(idx, {
                        ...rule,
                        field: (e.target as HTMLSelectElement).value as SortField,
                      })}
                    class="flex-1 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-white text-[11px] focus:outline-none focus:border-blue-500"
                  >
                    <option value="priority">Priority</option>
                    <option value="status">Status</option>
                    <option value="due">Due date</option>
                    <option value="summary">Title</option>
                    <option value="created">Created</option>
                  </select>
                  <button
                    onClick={() => updateSortRule(idx, { ...rule, asc: !rule.asc })}
                    class="px-1.5 py-1 rounded bg-slate-700 border border-slate-600 text-slate-300 text-[11px] hover:bg-slate-600 cursor-pointer"
                    title={rule.asc ? "Asc" : "Desc"}
                  >
                    {rule.asc ? "↑" : "↓"}
                  </button>
                  {sortRules.value.length > 1 && (
                    <button
                      onClick={() => removeSortRule(idx)}
                      class="text-slate-500 hover:text-red-400 px-1 cursor-pointer text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── Collections + Servers CRUD ────────────────────────────── */}
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Collections
              </h3>
              <div class="flex gap-1">
                {loadingCollections.value && (
                  <span class="text-xs text-slate-500 animate-pulse">Loading...</span>
                )}
                <button
                  onClick={() =>
                    setNewColServer(newColServer ? null : servers.value[0]?.id || null)}
                  class="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer px-1"
                >
                  + New
                </button>
              </div>
            </div>

            {/* Inline create form */}
            {newColServer !== null && (
              <div class="flex gap-1 mb-2 px-1">
                <input
                  type="text"
                  value={newColName}
                  placeholder="Collection name"
                  onInput={(e) => setNewColName((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleCreateCol(newColServer)
                    }
                  }}
                  class="flex-1 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-white text-[11px] placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={() => handleCreateCol(newColServer)}
                  disabled={!newColName.trim()}
                  class="px-2 py-1 rounded bg-green-700 hover:bg-green-600 disabled:bg-green-800 text-white text-[10px] cursor-pointer disabled:cursor-not-allowed"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setNewColServer(null)
                    setNewColName("")
                  }}
                  class="px-1 py-1 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {servers.value.map((s) => {
              const serverCols = collections.value.filter((c) => c.serverId === s.id).sort((a, b) =>
                a.displayName.localeCompare(b.displayName)
              )
              const tags = serverTags.value[s.id] || []
              return (
                <div key={s.id} class="mb-2">
                  <div class="flex items-center gap-1 px-2 mb-1">
                    <span class="text-[11px] text-slate-500 truncate flex-1">{s.name}</span>
                    <a
                      href="/settings"
                      class="text-[9px] text-slate-600 hover:text-red-400 cursor-pointer"
                    >
                      Disconnect
                    </a>
                  </div>
                  <div class="space-y-0.5">
                    {serverCols.map((col) => {
                      const undone = undoneCounts.value[col.href] ?? 0
                      const isRenaming = renamingCol[col.href]
                      if (isRenaming) {
                        return (
                          <div key={col.href} class="flex gap-1 px-1 items-center">
                            <input
                              type="text"
                              value={renameVal[col.href] ?? col.displayName}
                              onInput={(e) =>
                                setRenameVal({
                                  ...renameVal,
                                  [col.href]: (e.target as HTMLInputElement).value,
                                })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  handleRename(s.id, col.href)
                                }
                              }}
                              class="flex-1 px-1.5 py-1 rounded bg-slate-700 border border-slate-600 text-white text-[11px] focus:outline-none focus:border-blue-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRename(s.id, col.href)}
                              class="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setRenamingCol({ ...renamingCol, [col.href]: false })}
                              class="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      }
                      return (
                        <div
                          key={col.href}
                          class="group flex items-center gap-1 px-1 rounded hover:bg-slate-700/30"
                        >
                          <button
                            onClick={() => selectCollection(s.id, col.href)}
                            class={`flex-1 text-left py-1.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-2 ${
                              selectedCollection.value === col.href
                                ? "text-blue-300"
                                : "text-slate-300"
                            }`}
                          >
                            <span
                              class="shrink-0 w-3 h-3 rounded-sm"
                              style={{ backgroundColor: col.color || "#4b5563" }}
                            />
                            <span class="truncate flex-1">{col.displayName}</span>
                            {undone > 0 && (
                              <span class="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 rounded-full">
                                {undone}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setRenameVal({ ...renameVal, [col.href]: col.displayName })
                              setRenamingCol({ ...renamingCol, [col.href]: true })
                            }}
                            class="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 hover:text-blue-400 cursor-pointer px-0.5 transition-opacity"
                            title="Rename"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteCol(s.id, col.href)}
                            class="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 hover:text-red-400 cursor-pointer px-0.5 transition-opacity"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {/* Tags for this server */}
                  {tags.length > 0 && (
                    <div class="flex flex-wrap gap-1 mt-1.5 px-1">
                      {tags.slice(0, 30).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            filterTags.value = filterTags.value.includes(tag)
                              ? filterTags.value.filter((t) => t !== tag)
                              : [...filterTags.value, tag]
                          }}
                          class={`text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer transition-colors ${
                            filterTags.value.includes(tag)
                              ? "bg-blue-600/30 text-blue-300"
                              : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {collections.value.length === 0 && !loadingCollections.value && (
              <p class="text-xs text-slate-500 px-2">Add a server in Settings</p>
            )}
          </div>

          {/* Quick links at bottom */}
          <div class="pt-2 border-t border-slate-700">
            <a
              href="/settings"
              class="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Server settings
            </a>
          </div>
        </div>
      </aside>

      {/* Delete collection confirmation */}
      {confirmDelete && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            class="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-sm w-full mx-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p class="text-sm text-slate-200 mb-4">
              Delete{" "}
              <strong>{confirmDelete.name}</strong>? All todos in it will be permanently removed.
            </p>
            <div class="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                class="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDeleteCol(confirmDelete.serverId, confirmDelete.href)}
                class="flex-1 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
