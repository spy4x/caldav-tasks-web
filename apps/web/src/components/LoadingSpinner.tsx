export function LoadingSpinner({ text = "Loading..." }: { text?: string }) {
  return (
    <div class="flex flex-col items-center justify-center py-12 gap-3">
      <svg class="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-xs text-slate-500 animate-pulse">{text}</p>
    </div>
  )
}
