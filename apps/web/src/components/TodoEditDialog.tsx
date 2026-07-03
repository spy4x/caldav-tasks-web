import { useEffect, useState } from "preact/hooks"
import {
  allTodos,
  creatingTodo,
  editingTodo,
  error,
  selectedCollection,
  selectedServerId,
  showDeleteConfirm,
  showEditDialog,
} from "../state/+index.ts"
import type { TodoStatus } from "@shared/types"
import { api } from "../lib/api.ts"

export function TodoEditDialog() {
  const todo = editingTodo.value
  const isCreate = creatingTodo.value
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TodoStatus>(1)
  const [priority, setPriority] = useState(0)
  const [dueDate, setDueDate] = useState("")
  const [startDate, setStartDate] = useState("")
  const [location, setLocation] = useState("")
  const [categories, setCategories] = useState("")
  const [rrule, setRrule] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isCreate) {
      setSummary("")
      setDescription("")
      setStatus(1)
      setPriority(0)
      setDueDate("")
      setStartDate("")
      setLocation("")
      setCategories("")
      setRrule("")
    } else if (todo) {
      setSummary(todo.summary || "")
      setDescription(todo.description || "")
      setStatus(todo.status as TodoStatus)
      setPriority(todo.priority || 0)
      setDueDate(todo.due ? new Date(todo.due).toISOString().split("T")[0] : "")
      setLocation(todo.location || "")
      setCategories(todo.categories?.join(", ") || "")
      setRrule(todo.rrule || "")
    }
  }, [todo, isCreate])

  if (!showEditDialog.value) return null

  const handleSave = async () => {
    if (!summary.trim() || !selectedServerId.value) return
    setSubmitting(true)
    try {
      const data: any = {
        summary: summary.trim(),
        description: description.trim(),
        status,
        priority,
        due: dueDate ? new Date(dueDate + "T23:59:59").toISOString() : null,
        startDate: startDate ? new Date(startDate + "T00:00:00").toISOString() : null,
        location: location.trim(),
        categories: categories.split(",").map((s) => s.trim()).filter(Boolean),
        rrule,
        path: selectedCollection.value || undefined,
      }

      if (isCreate) {
        const result = await api.createTodo(selectedServerId.value, data)
        allTodos.value = [
          { ...result.todo, collectionHref: selectedCollection.value || "" },
          ...allTodos.value,
        ]
      } else if (todo) {
        data.etag = todo.etag
        data.href = todo.href
        const result = await api.updateTodo(selectedServerId.value, todo.uid, data)
        allTodos.value = allTodos.value.map((t) =>
          t.uid === todo.uid ? { ...t, ...result.todo, collectionHref: t.collectionHref } : t
        )
      }
      showEditDialog.value = false
      creatingTodo.value = false
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = () => {
    if (!todo) return
    showEditDialog.value = false
    showDeleteConfirm.value = {
      type: "todo",
      id: todo.uid,
      name: todo.summary,
      onConfirm: async () => {
        try {
          await api.deleteTodo(
            selectedServerId.value!,
            todo.uid,
            selectedCollection.value || undefined,
            todo.href,
          )
          allTodos.value = allTodos.value.filter((t: any) => t.uid !== todo.uid)
        } catch (err) {
          error.value = (err as Error).message
        }
      },
    }
  }

  const rrOptions = [
    { value: "", label: "Does not repeat" },
    { value: "FREQ=DAILY", label: "Daily" },
    { value: "FREQ=WEEKLY", label: "Weekly" },
    { value: "FREQ=MONTHLY", label: "Monthly" },
    { value: "FREQ=YEARLY", label: "Yearly" },
    { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Weekdays" },
  ]

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/60 overflow-y-auto"
      onClick={() => {
        showEditDialog.value = false
        creatingTodo.value = false
      }}
    >
      <div
        class="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault()
            handleSave()
          }
        }}
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">{isCreate ? "New Todo" : "Edit Todo"}</h3>
          <button
            onClick={() => {
              showEditDialog.value = false
              creatingTodo.value = false
            }}
            class="text-slate-500 hover:text-white cursor-pointer p-1"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3">
          {/* Title */}
          <div>
            <label class="block text-xs text-slate-400 mb-1">Title</label>
            <input
              type="text"
              value={summary}
              onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
              placeholder="What needs to be done?"
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {/* Status + Priority */}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(parseInt((e.target as HTMLSelectElement).value) as TodoStatus)}
                class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={1}>Needs Action</option>
                <option value={2}>In Progress</option>
                <option value={3}>Completed</option>
                <option value={4}>Cancelled</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(parseInt((e.target as HTMLSelectElement).value))}
                class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={0}>None</option>
                <option value={1}>🔴 Highest</option>
                <option value={2}>🟠 High</option>
                <option value={3}>🟡 Medium-High</option>
                <option value={4}>🟢 Medium</option>
                <option value={5}>🔵 Medium-Low</option>
                <option value={9}>⚪ Low</option>
              </select>
            </div>
          </div>

          {/* Due + Recurrence */}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onInput={(e) => setDueDate((e.target as HTMLInputElement).value)}
                class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Repeat</label>
              <select
                value={rrule}
                onChange={(e) => setRrule((e.target as HTMLSelectElement).value)}
                class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {rrOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Categories */}
          <div>
            <label class="block text-xs text-slate-400 mb-1">Categories (comma-separated)</label>
            <input
              type="text"
              value={categories}
              onInput={(e) => setCategories((e.target as HTMLInputElement).value)}
              placeholder="Work, Personal, Errand"
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Divider before advanced */}
          <div class="border-t border-slate-700/50 pt-1">
            <button
              onClick={() => setExpanded(!expanded)}
              class="text-xs text-blue-400 hover:text-blue-300 cursor-pointer bg-transparent border-none flex items-center gap-1"
            >
              <span class={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
                ▶
              </span>
              {expanded ? "Less fields" : "More fields"}
            </button>
          </div>

          {expanded && (
            <>
              <div>
                <label class="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                  class="w-full min-h-[80px] px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
                    class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={location}
                    onInput={(e) => setLocation((e.target as HTMLInputElement).value)}
                    placeholder="Where?"
                    class="w-full px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Created timestamp (read-only, edit only) */}
          {!isCreate && todo?.uid && (
            <div class="text-[10px] text-slate-600 text-right">
              UID: <span class="font-mono">{todo.uid.slice(0, 8)}…</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div class="flex gap-2 mt-5">
          {!isCreate && (
            <button
              onClick={handleDelete}
              class="px-3 py-2 rounded-lg bg-red-700/40 hover:bg-red-700 text-red-300 text-sm transition-colors cursor-pointer"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              showEditDialog.value = false
              creatingTodo.value = false
            }}
            class="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting || !summary.trim()}
            class="flex-[2] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
