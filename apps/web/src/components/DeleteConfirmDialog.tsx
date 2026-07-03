import { showDeleteConfirm } from "../state/+index.ts"

export function DeleteConfirmDialog() {
  const ctx = showDeleteConfirm.value
  if (!ctx) return null

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={() => showDeleteConfirm.value = null}
    >
      <div
        class="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="text-center mb-4">
          <div class="text-3xl mb-2">🗑️</div>
          <h3 class="text-lg font-semibold text-white mb-1">
            {ctx.type === "server" ? "Disconnect server?" : `Delete ${ctx.type}?`}
          </h3>
          <p class="text-sm text-slate-400">
            {ctx.type === "server"
              ? (
                <>
                  This removes server credentials from this app. No data on the server will be
                  changed.
                </>
              )
              : (
                <>
                  Are you sure you want to delete{" "}
                  <span class="text-slate-200 font-medium">"{ctx.name}"</span>? This action cannot
                  be undone.
                </>
              )}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            onClick={() => showDeleteConfirm.value = null}
            class="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              await ctx.onConfirm()
              showDeleteConfirm.value = null
            }}
            class="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {ctx.type === "server" ? "Disconnect" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}
