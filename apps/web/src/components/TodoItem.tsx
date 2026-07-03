import type { TodoItem as TodoItemType } from "@shared/types"
import { TODO_STATUS_LABELS } from "@shared/types"

interface Props {
  todo: TodoItemType
  onToggle: () => void
  onClick: () => void
}

const priorityBorder: Record<number, string> = {
  1: "border-l-red-500",
  2: "border-l-orange-500",
  3: "border-l-amber-500",
  4: "border-l-yellow-500",
  5: "border-l-green-500",
  9: "border-l-slate-600",
}

export function TodoItem({ todo, onToggle, onClick }: Props) {
  const isInactive = todo.status === 3 || todo.status === 4
  const border = isInactive
    ? "border-l-slate-700"
    : (priorityBorder[todo.priority] || "border-l-slate-700")

  const checkboxClass = (() => {
    switch (todo.status) {
      case 1:
        return "border-slate-500 hover:border-blue-400"
      case 2:
        return "bg-amber-400 border-amber-400"
      case 3:
        return "bg-green-500 border-green-500"
      case 4:
        return "bg-red-500 border-red-500"
      default:
        return "border-slate-500 hover:border-blue-400"
    }
  })()

  const checkboxIcon = (() => {
    switch (todo.status) {
      case 2: // In Progress — white dot
        return (
          <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="5" />
          </svg>
        )
      case 3: // Completed — white tick
        return (
          <svg
            class="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )
      case 4: // Cancelled — white cross
        return (
          <svg
            class="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return null
    }
  })()

  return (
    <div
      class={`flex items-start gap-3 px-3 py-2.5 rounded-lg border border-slate-700 border-l-4 ${border} transition-colors cursor-pointer ${
        isInactive ? "bg-slate-800/30 opacity-60" : "bg-slate-800/50 hover:bg-slate-800/80"
      }`}
      onClick={onClick}
    >
      {/* Checkbox — 4 states */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        class={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${checkboxClass}`}
      >
        {checkboxIcon}
      </button>

      {/* Content */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p
            class={`text-sm ${isInactive ? "line-through text-slate-500" : "text-slate-200"}`}
          >
            {todo.summary}
          </p>
          {todo.priority > 0 && !isInactive && (
            <span
              class={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                todo.priority <= 2
                  ? "bg-red-900/60 text-red-300"
                  : todo.priority <= 4
                  ? "bg-amber-900/60 text-amber-300"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              P{todo.priority}
            </span>
          )}
        </div>

        {(todo.description || todo.due || todo.categories.length > 0 || todo.location ||
          todo.rrule) && (
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {todo.description && (
              <p class="text-xs text-slate-500 w-full whitespace-pre-wrap">{todo.description}</p>
            )}
            {todo.due && (
              <span class="text-[11px] text-slate-500">
                Due: {new Date(todo.due).toLocaleDateString()}
              </span>
            )}
            {todo.categories.length > 0 && (
              <span class="text-[11px] text-slate-500">
                {todo.categories.slice(0, 2).join(", ")}
                {todo.categories.length > 2 ? "..." : ""}
              </span>
            )}
            {todo.location && <span class="text-[11px] text-slate-500">📍 {todo.location}</span>}
            {todo.rrule && <span class="text-[11px] text-blue-400">🔄 Recurring</span>}
          </div>
        )}
      </div>

      {/* Status badge instead of "✓ Done" */}
      <span
        class={`text-[10px] shrink-0 ${
          todo.status === 3
            ? "text-green-500"
            : todo.status === 4
            ? "text-red-400"
            : "text-slate-600"
        }`}
      >
        {todo.status === 3
          ? "✓ Done"
          : todo.status === 4
          ? "✕ Cancelled"
          : TODO_STATUS_LABELS[todo.status]}
      </span>
    </div>
  )
}
