import { useEffect, useState } from "preact/hooks"
import { selectedServerId, servers } from "../state/+index.ts"
import { api } from "../lib/api.ts"

export function ServersPage() {
  const [calendars, setCalendars] = useState<any[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    username: "",
    password: "",
    serverType: 1,
  })
  const [err, setErr] = useState<string | null>(null)

  const loadServers = () => {
    api.listServers().then((data) => {
      servers.value = data.servers
    }).catch(() => {})
  }

  useEffect(loadServers, [])

  const handleAdd = async (e: Event) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.addServer(form)
      loadServers()
      setShowForm(false)
      setForm({ name: "", baseUrl: "", username: "", password: "", serverType: 1 })
    } catch (err) {
      setErr((err as Error).message)
    }
  }

  const handleDelete = async (id: number) => {
    await api.deleteServer(id)
    servers.value = servers.value.filter((s) => s.id !== id)
    if (selectedServerId.value === id) {
      selectedServerId.value = null
    }
  }

  const handleDiscover = async (serverId: number) => {
    setDiscovering(true)
    setErr(null)
    try {
      const data = await api.getCalendars(serverId)
      setCalendars(data.calendars)
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setDiscovering(false)
    }
  }

  const handleSelectCalendar = async (serverId: number, href: string) => {
    try {
      await fetch(`/api/servers/${serverId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarPath: href }),
      })
      loadServers()
      setCalendars([])
    } catch (err) {
      setErr((err as Error).message)
    }
  }

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-white">CalDAV Servers</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          {showForm ? "Cancel" : "Add server"}
        </button>
      </div>

      {err && (
        <div class="bg-red-900/40 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          class="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3"
        >
          <div>
            <label class="block text-xs text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onInput={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })}
              placeholder="My CalDAV"
              class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Server Type</label>
              <select
                value={form.serverType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    serverType: parseInt((e.target as HTMLSelectElement).value),
                  })}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="1">Radicale</option>
                <option value="2">Stalwart</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Server URL</label>
              <input
                type="url"
                value={form.baseUrl}
                onInput={(e) => setForm({ ...form, baseUrl: (e.target as HTMLInputElement).value })}
                placeholder="https://cal.example.com"
                required
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onInput={(e) =>
                  setForm({ ...form, username: (e.target as HTMLInputElement).value })}
                required
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onInput={(e) =>
                  setForm({ ...form, password: (e.target as HTMLInputElement).value })}
                required
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            class="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Add server
          </button>
        </form>
      )}

      {/* Server list */}
      {servers.value.length === 0 && !showForm && (
        <div class="text-center py-12 text-slate-500 text-sm">
          No servers configured. Add a CalDAV server above.
        </div>
      )}

      <div class="space-y-3">
        {servers.value.map((server) => (
          <div key={server.id} class="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div class="flex items-start justify-between">
              <div class="min-w-0">
                <h3 class="text-white font-medium text-sm">{server.name}</h3>
                <p class="text-xs text-slate-500 mt-0.5">
                  {server.baseUrl} • {server.username}
                  {server.serverType === 2 ? " • Stalwart" : " • Radicale"}
                </p>
                {server.calendarPath && (
                  <p class="text-xs text-blue-400 mt-0.5 truncate max-w-xs">
                    📅 {server.calendarPath}
                  </p>
                )}
              </div>
              <button
                onClick={() =>
                  handleDelete(server.id)}
                class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer p-1 text-xs"
              >
                Remove
              </button>
            </div>

            {!server.calendarPath && (
              <div class="mt-3">
                <button
                  onClick={() => handleDiscover(server.id)}
                  disabled={discovering}
                  class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {discovering ? "Discovering..." : "Discover calendars"}
                </button>
              </div>
            )}

            {/* Calendar list */}
            {calendars.length > 0 && !server.calendarPath && (
              <div class="mt-3 space-y-1">
                <p class="text-xs text-slate-400">Select a calendar:</p>
                {calendars.map((cal) => (
                  <button
                    key={cal.href}
                    onClick={() => handleSelectCalendar(server.id, cal.href)}
                    class="w-full text-left px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer border border-slate-600"
                  >
                    📅 {cal.displayName}
                    <span class="block text-[10px] text-slate-600 mt-0.5">{cal.href}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
