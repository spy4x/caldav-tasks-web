import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { getDisplayName, showHotkeys, sidebarOpen, user } from "../state/+index.ts"
import { api } from "../lib/api.ts"
import { Sidebar } from "./Sidebar.tsx"
import { HotkeysDialog } from "./HotkeysDialog.tsx"

export function Layout({ children }: { children: ComponentChildren }) {
  const [, setLocation] = useLocation()

  // Global hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger in input fields
      if (
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return
      if (e.key === "?") {
        showHotkeys.value = !showHotkeys.value
        e.preventDefault()
      }
      if (e.key === "s" || e.key === "S") {
        document.querySelector<HTMLInputElement>("[data-search]")?.focus()
        e.preventDefault()
      }
      if (e.key === "n" || e.key === "N") {
        document.querySelector<HTMLButtonElement>("[data-add]")?.click()
        e.preventDefault()
      }
      if (e.key === "b" || e.key === "B") {
        sidebarOpen.value = !sidebarOpen.value
        localStorage.setItem("sidebar_collapsed", String(!sidebarOpen.value))
        e.preventDefault()
      }
    }
    globalThis.addEventListener("keydown", handler)
    return () => globalThis.removeEventListener("keydown", handler)
  }, [])

  const handleSignOut = async () => {
    await api.signOut().catch(() => {})
    user.value = null
    localStorage.removeItem("userId")
    setLocation("/")
  }

  return (
    <div class="min-h-screen flex flex-col">
      <header class="bg-slate-800 border-b border-slate-700 px-3 py-2.5 flex items-center justify-between shrink-0 z-20">
        <div class="flex items-center gap-3">
          <button
            onClick={() => {
              sidebarOpen.value = !sidebarOpen.value
              localStorage.setItem("sidebar_collapsed", String(!sidebarOpen.value))
            }}
            class="text-slate-300 hover:text-white p-1 cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <a href="/" class="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span>
            <span class="hidden sm:inline">TodoApp</span>
          </a>
          <nav class="hidden md:flex gap-4 text-sm ml-4">
            <a href="/" class="text-slate-300 hover:text-white transition-colors">Dashboard</a>
            <a href="/settings" class="text-slate-300 hover:text-white transition-colors">
              Settings
            </a>
          </nav>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/profile"
            class="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title="Profile"
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
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span class="max-w-[120px] truncate">{getDisplayName(user.value)}</span>
          </a>
          <button
            onClick={handleSignOut}
            class="text-xs px-2.5 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>
      <div class="flex flex-1 overflow-hidden">
        <Sidebar />
        <main class="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <HotkeysDialog />
    </div>
  )
}
