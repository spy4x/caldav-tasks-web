import { useEffect, useState } from "preact/hooks"
import { collections, error as globalErr, servers, user } from "../state/+index.ts"
import { api } from "../lib/api.ts"
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog.tsx"
import { showDeleteConfirm } from "../state/+index.ts"

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "servers">("servers")

  // Profile: Name + Email (separate save)
  const [firstName, setFirstName] = useState("")
  const [secondName, setSecondName] = useState("")
  const [email, setEmail] = useState("")
  const [profMsg, setProfMsg] = useState("")
  const [profErr, setProfErr] = useState("")

  // Profile: Username (separate save)
  const [newUsername, setNewUsername] = useState("")
  const [pwForUser, setPwForUser] = useState("")
  const [userMsg, setUserMsg] = useState("")
  const [userErr, setUserErr] = useState("")

  // Profile: Password (separate save)
  const [curPw, setCurPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [pwMsg, setPwMsg] = useState("")
  const [pwErr, setPwErr] = useState("")

  // Server management
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(
    { name: "", baseUrl: "", username: "", password: "", serverType: 1 },
  )
  const [err, setErr] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<Record<number, any[]>>({})
  const [discovering, setDiscovering] = useState<Record<number, boolean>>({})
  const [newColName, setNewColName] = useState("")
  const [creatingCol, setCreatingCol] = useState<Record<number, boolean>>({})
  const [renaming, setRenaming] = useState<Record<string, boolean>>({})
  const [renameValues, setRenameValues] = useState<Record<string, string>>({})

  useEffect(() => {
    loadServers()
    if (user.value) {
      setFirstName(user.value.firstName || "")
      setSecondName(user.value.secondName || "")
      setEmail(user.value.email || "")
      setNewUsername(user.value.username || "")
    }
  }, [])

  const loadServers = () => {
    api.listServers().then((data) => {
      servers.value = data.servers
    }).catch(() => {})
  }

  // ─── Profile: Name/Email ─────────────────────────────────────────────
  const handleProfileSave = async (e: Event) => {
    e.preventDefault()
    setProfMsg("")
    setProfErr("")
    try {
      await api.updateProfile({ email, firstName, secondName })
      setProfMsg("Name and email updated!")
      if (user.value) user.value = { ...user.value, email, firstName, secondName }
    } catch (err) {
      setProfErr((err as Error).message)
    }
  }

  // ─── Profile: Username ───────────────────────────────────────────────
  const handleUsernameSave = async (e: Event) => {
    e.preventDefault()
    setUserMsg("")
    setUserErr("")
    if (!newUsername.trim()) {
      setUserErr("Username required")
      return
    }
    try {
      await api.changeUsername(newUsername.trim(), pwForUser)
      setUserMsg("Username updated!")
      setPwForUser("")
      if (user.value) user.value = { ...user.value, username: newUsername.trim() }
    } catch (err) {
      setUserErr((err as Error).message)
    }
  }

  // ─── Profile: Password ───────────────────────────────────────────────
  const handlePasswordSave = async (e: Event) => {
    e.preventDefault()
    setPwMsg("")
    setPwErr("")
    if (!curPw || !newPw) {
      setPwErr("Fill both fields")
      return
    }
    try {
      await api.changePassword(curPw, newPw)
      setPwMsg("Password updated!")
      setCurPw("")
      setNewPw("")
    } catch (err) {
      setPwErr((err as Error).message)
    }
  }

  // ─── Server CRUD ────────────────────────────────────────────────────
  const handleAddServer = async (e: Event) => {
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

  const handleDeleteServer = (id: number, name: string) => {
    showDeleteConfirm.value = {
      type: "server",
      id: String(id),
      name,
      onConfirm: async () => {
        await api.deleteServer(id)
        servers.value = servers.value.filter((s) => s.id !== id)
      },
    }
  }

  const handleDiscover = async (serverId: number) => {
    setDiscovering({ ...discovering, [serverId]: true })
    try {
      const data = await api.getCalendars(serverId)
      setCalendars({ ...calendars, [serverId]: data.calendars })
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setDiscovering({ ...discovering, [serverId]: false })
    }
  }

  const handleCreateCollection = async (serverId: number) => {
    if (!newColName.trim()) return
    setCreatingCol({ ...creatingCol, [serverId]: true })
    try {
      await api.createCollection(serverId, newColName.trim())
      setNewColName("")
      const data = await api.getCalendars(serverId)
      setCalendars({ ...calendars, [serverId]: data.calendars })
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setCreatingCol({ ...creatingCol, [serverId]: false })
    }
  }

  const handleRenameCollection = async (serverId: number, href: string) => {
    const newName = renameValues[href]
    if (!newName?.trim()) return
    setRenaming({ ...renaming, [href]: true })
    try {
      await api.updateCollection(serverId, href, newName.trim())
      const data = await api.getCalendars(serverId)
      setCalendars({ ...calendars, [serverId]: data.calendars })
      setRenameValues({ ...renameValues, [href]: "" })
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setRenaming({ ...renaming, [href]: false })
    }
  }

  const handleDeleteCollection = async (serverId: number, href: string, name: string) => {
    showDeleteConfirm.value = {
      type: "collection",
      id: href,
      name,
      onConfirm: async () => {
        try {
          await api.deleteCollection(serverId, href)
          const data = await api.getCalendars(serverId)
          setCalendars({ ...calendars, [serverId]: data.calendars })
        } catch (err) {
          setErr((err as Error).message)
        }
      },
    }
  }

  return (
    <div class="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <h2 class="text-xl font-bold text-white mb-6">Settings</h2>

      {/* Tab bar */}
      <div class="flex gap-4 border-b border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab("servers")}
          class={`pb-2 text-sm font-medium transition-colors cursor-pointer border-b-2 ${
            activeTab === "servers"
              ? "text-blue-400 border-blue-500"
              : "text-slate-400 border-transparent hover:text-slate-200"
          }`}
        >
          Servers & Collections
        </button>
        <button
          onClick={() => setActiveTab("profile")}
          class={`pb-2 text-sm font-medium transition-colors cursor-pointer border-b-2 ${
            activeTab === "profile"
              ? "text-blue-400 border-blue-500"
              : "text-slate-400 border-transparent hover:text-slate-200"
          }`}
        >
          Profile
        </button>
      </div>

      {/* Global error */}
      {err && (
        <div class="bg-red-900/40 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300 mb-4 flex items-center justify-between">
          <span>{err}</span>
          <button
            onClick={() => setErr(null)}
            class="text-red-400 hover:text-red-200 cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* SERVERS TAB */}
      {/* ════════════════════════════════════════ */}
      {activeTab === "servers" && (
        <div class="space-y-6">
          <div class="flex justify-end">
            <button
              onClick={() => setShowForm(!showForm)}
              class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {showForm ? "Cancel" : "Add server"}
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleAddServer}
              class="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onInput={(e) =>
                      setForm({ ...form, name: (e.target as HTMLInputElement).value })}
                    class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
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
                    onInput={(e) =>
                      setForm({ ...form, baseUrl: (e.target as HTMLInputElement).value })}
                    required
                    class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onInput={(e) =>
                      setForm({ ...form, username: (e.target as HTMLInputElement).value })}
                    required
                    class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
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
                    class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
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

          {servers.value.map((server) => (
            <div
              key={server.id}
              class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
            >
              <div class="p-4 flex items-start justify-between border-b border-slate-700/50">
                <div class="min-w-0">
                  <h3 class="text-white font-medium text-sm">{server.name}</h3>
                  <p class="text-xs text-slate-500 mt-0.5">
                    {server.baseUrl} • {server.username}
                    {server.serverType === 2 ? " • Stalwart" : " • Radicale"}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteServer(server.id, server.name)}
                  class="text-slate-600 hover:text-red-400 transition-colors cursor-pointer text-xs px-2 py-1"
                >
                  Disconnect
                </button>
              </div>

              <div class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Collections
                  </h4>
                  <button
                    onClick={() => handleDiscover(server.id)}
                    disabled={discovering[server.id]}
                    class="text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {discovering[server.id] ? "Loading..." : "Discover"}
                  </button>
                </div>

                {(calendars[server.id] || []).length > 0
                  ? (
                    <div class="space-y-1.5 mb-4">
                      {(calendars[server.id] || []).map((cal: any) => (
                        <div
                          key={cal.href}
                          class="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-700/30 border border-slate-700"
                        >
                          <span
                            class="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: cal.color || "#4b5563" }}
                          />
                          {renaming[cal.href]
                            ? (
                              <div class="flex-1 flex gap-1">
                                <input
                                  type="text"
                                  value={renameValues[cal.href] || cal.displayName}
                                  onInput={(e) =>
                                    setRenameValues({
                                      ...renameValues,
                                      [cal.href]: (e.target as HTMLInputElement).value,
                                    })}
                                  class="flex-1 px-2 py-0.5 rounded bg-slate-600 border border-slate-500 text-white text-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRenameCollection(server.id, cal.href)}
                                  class="text-xs text-blue-400 hover:text-blue-300 px-1 cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setRenaming({ ...renaming, [cal.href]: false })
                                    setRenameValues({ ...renameValues, [cal.href]: "" })
                                  }}
                                  class="text-xs text-slate-500 hover:text-slate-300 px-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            )
                            : (
                              <>
                                <span class="flex-1 text-xs text-slate-300 truncate">
                                  {cal.displayName}
                                </span>
                                <button
                                  onClick={() => {
                                    setRenameValues({
                                      ...renameValues,
                                      [cal.href]: cal.displayName,
                                    })
                                    setRenaming({ ...renaming, [cal.href]: true })
                                  }}
                                  class="text-[10px] text-slate-500 hover:text-blue-400 cursor-pointer p-0.5"
                                  title="Rename"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteCollection(server.id, cal.href, cal.displayName)}
                                  class="text-[10px] text-slate-500 hover:text-red-400 cursor-pointer p-0.5"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                        </div>
                      ))}
                    </div>
                  )
                  : <p class="text-xs text-slate-600 mb-4">Click "Discover" to find collections</p>}

                <div class="flex gap-2">
                  <input
                    type="text"
                    value={newColName}
                    onInput={(e) => setNewColName((e.target as HTMLInputElement).value)}
                    placeholder="New collection name..."
                    class="flex-1 px-2.5 py-1.5 rounded bg-slate-700 border border-slate-600 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => handleCreateCollection(server.id)}
                    disabled={!newColName.trim() || creatingCol[server.id]}
                    class="px-2.5 py-1.5 rounded bg-green-700 hover:bg-green-600 disabled:bg-green-800 text-white text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {creatingCol[server.id] ? "..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {servers.value.length === 0 && !showForm && (
            <div class="text-center py-12 text-slate-500 text-sm">
              No servers configured. Add a CalDAV server above.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* PROFILE TAB */}
      {/* ════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div class="max-w-md space-y-6">
          {/* Name & Email */}
          <form
            onSubmit={handleProfileSave}
            class="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3"
          >
            <h3 class="text-sm font-semibold text-white">Name & Email</h3>
            {profMsg && (
              <div class="bg-green-900/40 text-green-300 px-3 py-2 rounded text-sm">{profMsg}</div>
            )}
            {profErr && (
              <div class="bg-red-900/40 text-red-300 px-3 py-2 rounded text-sm">{profErr}</div>
            )}
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-slate-400 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onInput={(e) => setFirstName((e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-xs text-slate-400 mb-1">Last Name</label>
                <input
                  type="text"
                  value={secondName}
                  onInput={(e) => setSecondName((e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              class="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Save Name & Email
            </button>
          </form>

          {/* Username */}
          <form
            onSubmit={handleUsernameSave}
            class="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3"
          >
            <h3 class="text-sm font-semibold text-white">Username (login)</h3>
            {userMsg && (
              <div class="bg-green-900/40 text-green-300 px-3 py-2 rounded text-sm">{userMsg}</div>
            )}
            {userErr && (
              <div class="bg-red-900/40 text-red-300 px-3 py-2 rounded text-sm">{userErr}</div>
            )}
            <div>
              <label class="block text-xs text-slate-400 mb-1">New Username</label>
              <input
                type="text"
                value={newUsername}
                onInput={(e) => setNewUsername((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">
                Current Password (required to change username)
              </label>
              <input
                type="password"
                value={pwForUser}
                onInput={(e) => setPwForUser((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              class="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Save Username
            </button>
          </form>

          {/* Password */}
          <form
            onSubmit={handlePasswordSave}
            class="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3"
          >
            <h3 class="text-sm font-semibold text-white">Password</h3>
            {pwMsg && (
              <div class="bg-green-900/40 text-green-300 px-3 py-2 rounded text-sm">{pwMsg}</div>
            )}
            {pwErr && (
              <div class="bg-red-900/40 text-red-300 px-3 py-2 rounded text-sm">{pwErr}</div>
            )}
            <div>
              <label class="block text-xs text-slate-400 mb-1">Current Password</label>
              <input
                type="password"
                value={curPw}
                onInput={(e) => setCurPw((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onInput={(e) => setNewPw((e.target as HTMLInputElement).value)}
                minLength={8}
                class="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              class="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Change Password
            </button>
          </form>

          {/* Danger Zone */}
          <div class="bg-slate-800 rounded-xl p-5 border border-red-900/50 space-y-3">
            <h3 class="text-sm font-semibold text-red-400">Danger Zone</h3>
            <p class="text-xs text-slate-400">
              Delete your account and all data. This cannot be undone.
            </p>
            <button
              onClick={() => {
                showDeleteConfirm.value = {
                  type: "account",
                  id: "self",
                  name: user.value?.username || user.value?.email || "your account",
                  onConfirm: async () => {
                    await api.deleteAccount()
                    user.value = null
                    localStorage.removeItem("userId")
                    globalThis.location.href = "/"
                  },
                }
              }}
              class="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Delete Account
            </button>
          </div>
        </div>
      )}

      <DeleteConfirmDialog />
    </div>
  )
}
