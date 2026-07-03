import { showHotkeys } from "../state/+index.ts"

export function HotkeysDialog() {
  if (!showHotkeys.value) return null

  const shortcuts = [
    { key: "?", desc: "Show this dialog" },
    { key: "S", desc: "Focus search bar" },
    { key: "N", desc: "New todo" },
    { key: "B", desc: "Toggle sidebar" },
    { key: "Esc", desc: "Close dialog / cancel" },
    { key: "Tab", desc: "Move between fields" },
    { key: "Enter", desc: "Save / confirm" },
  ]

  return (
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={() => showHotkeys.value = false}
    >
      <div
        class="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">⌨️ Keyboard Shortcuts</h3>
          <button
            onClick={() => showHotkeys.value = false}
            class="text-slate-500 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div class="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} class="flex items-center justify-between">
              <span class="text-sm text-slate-300">{s.desc}</span>
              <kbd class="px-2 py-0.5 rounded bg-slate-700 text-slate-200 text-xs font-mono border border-slate-600">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <p class="text-xs text-slate-500 mt-4">
          Press <kbd class="px-1 py-0.5 rounded bg-slate-700 text-xs font-mono">?</kbd>{" "}
          anytime to toggle
        </p>
      </div>
    </div>
  )
}
