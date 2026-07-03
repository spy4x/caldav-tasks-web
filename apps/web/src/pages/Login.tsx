import { useState } from "preact/hooks"
import { user } from "../state/+index.ts"
import { api } from "../lib/api.ts"

export function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErr(null)
    setSubmitting(true)
    try {
      const result = isSignUp
        ? await api.signUp(username, password)
        : await api.signIn(username, password)
      user.value = result.user
      localStorage.setItem("userId", String(result.user.id))
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="min-h-full flex items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">📋 TodoApp</h1>
          <p class="text-slate-400 text-sm">CalDAV task manager</p>
        </div>

        <form
          onSubmit={handleSubmit}
          class="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4"
        >
          <h2 class="text-lg font-semibold text-white">
            {isSignUp ? "Create account" : "Sign in"}
          </h2>

          {err && (
            <div class="bg-red-900/40 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">
              {err}
            </div>
          )}

          <div>
            <label class="block text-sm text-slate-400 mb-1" for="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              required
              autocomplete="username"
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="Your username"
            />
          </div>

          <div>
            <label class="block text-sm text-slate-400 mb-1" for="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              required
              minLength={8}
              autocomplete={isSignUp ? "new-password" : "current-password"}
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="Min 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            class="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium transition-colors cursor-pointer disabled:cursor-not-allowed text-sm"
          >
            {submitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErr(null)
            }}
            class="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors cursor-pointer bg-transparent border-none"
          >
            {isSignUp ? "Already have an account? Sign in" : "No account? Create one"}
          </button>
        </form>

        {/* Quick tip */}
        <div class="mt-4 text-center text-[11px] text-slate-600">
          Tip: Press{" "}
          <kbd class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">?</kbd>{" "}
          for keyboard shortcuts
        </div>
      </div>
    </div>
  )
}
