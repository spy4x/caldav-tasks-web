import { useState } from "preact/hooks"
import { currentServerId, error, todos } from "../state/+index.ts"
import { api } from "../lib/api.ts"

export function TodoForm() {
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState(0)
  const [showMore, setShowMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!summary.trim() || !currentServerId.value) return

    setSubmitting(true)
    try {
      const { todo } = await api.createTodo(currentServerId.value, {
        summary: summary.trim(),
        description: description.trim(),
        priority,
      })
      todos.value = [todo, ...todos.value]
      setSummary("")
      setDescription("")
      setPriority(0)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      class="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3"
    >
      <div class="flex gap-2">
        <input
          type="text"
          value={summary}
          onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
          placeholder="Add a todo..."
          class="flex-1 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={!summary.trim() || submitting}
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        class="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer bg-transparent border-none"
      >
        {showMore ? "Less options" : "More options"}
      </button>

      {showMore && (
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              rows={2}
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(parseInt((e.target as HTMLSelectElement).value))}
              class="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={0}>None</option>
              <option value={1}>1 - Highest</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5 - Medium</option>
              <option value={9}>9 - Lowest</option>
            </select>
          </div>
        </div>
      )}
    </form>
  )
}
