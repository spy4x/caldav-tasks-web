import type { TodoItem as TodoItemType } from "@shared/types"

interface Props {
  todo: TodoItemType
  onToggle: () => void
  onDelete: () => void
}

const statusLabels: Record<number, string> = {
  1: "Needs Action",
  2: "In Progress",
  3: "Completed",
  4: "Cancelled",
}

const priorityColors: Record<number, string> = {
  1: "border-red-500",
  2: "border-orange-500",
  3: "border-amber-500",
  4: "border-yellow-500",
  5: "border-slate-500",
}

export function TodoItem({ todo, onToggle, onDelete }: Props) {
  const isDone = todo.status === 3
  const borderColor = priorityColors[todo.priority as keyof typeof priorityColors] ||
    "border-slate-700"

  return (
    <div
      class={`flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-800/50 border-l-4 ${borderColor} ${
        isDone ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onToggle}
        class={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
          isDone ? "bg-green-500 border-green-500" : "border-slate-500 hover:border-blue-400"
        }`}
      >
        {isDone && (
          <svg
            class="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div class="flex-1 min-w-0">
        <p class={`text-sm ${isDone ? "line-through text-slate-500" : "text-slate-200"}`}>
          {todo.summary}
        </p>
        {todo.description && (
          <p class="text-xs text-slate-500 mt-0.5 line-clamp-2">{todo.description}</p>
        )}
        <div class="flex gap-2 mt-1">
          <span class="text-[10px] text-slate-600 uppercase">
            {statusLabels[todo.status] || "Unknown"}
          </span>
          {todo.priority > 0 && <span class="text-[10px] text-slate-600">P{todo.priority}</span>}
          {todo.due && (
            <span class="text-[10px] text-slate-600">
              Due: {new Date(todo.due).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer p-1"
        title="Delete"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}
