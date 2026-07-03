import type { TodoUpdate } from "@shared/types"

const BASE = "" as const

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers as Record<string, string> },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Auth
  signUp: (username: string, password: string) =>
    request<{ user: { id: number; email: string } }>("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  signIn: (username: string, password: string) =>
    request<{ user: { id: number; email: string; firstName?: string; secondName?: string } }>(
      "/api/auth/sign-in",
      { method: "POST", body: JSON.stringify({ username, password }) },
    ),
  signOut: () => request<{ success: boolean }>("/api/auth/sign-out", { method: "POST" }),
  me: () =>
    request<
      {
        user: {
          id: number
          email: string
          firstName?: string
          secondName?: string
          role?: number
          username?: string
        }
      }
    >("/api/auth/me"),

  // Profile
  updateProfile: (data: { email?: string; firstName?: string; secondName?: string }) =>
    request<{ success: boolean }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  changeUsername: (newUsername: string, currentPassword: string) =>
    request<{ success: boolean }>("/api/auth/username", {
      method: "PUT",
      body: JSON.stringify({ newUsername, currentPassword }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: () => request<{ success: boolean }>("/api/auth/user", { method: "DELETE" }),

  // Servers
  listServers: () => request<{ servers: any[] }>("/api/servers"),
  addServer: (
    data: {
      name?: string
      baseUrl: string
      username: string
      password: string
      serverType?: number
    },
  ) => request<{ server: any }>("/api/servers", { method: "POST", body: JSON.stringify(data) }),
  deleteServer: (id: number) =>
    request<{ success: boolean }>(`/api/servers/${id}`, { method: "DELETE" }),
  updateServer: (id: number, data: Record<string, string>) =>
    request<{ success: boolean }>(`/api/servers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Collections
  getCalendars: (serverId: number) =>
    request<{ calendars: { href: string; displayName: string; color?: string }[] }>(
      `/api/servers/${serverId}/calendars`,
    ),
  createCollection: (serverId: number, displayName: string) =>
    request<{ collection: { href: string; displayName: string } }>(
      `/api/servers/${serverId}/calendars`,
      { method: "POST", body: JSON.stringify({ displayName }) },
    ),
  updateCollection: (serverId: number, href: string, displayName: string) =>
    request<{ success: boolean }>(`/api/servers/${serverId}/calendars`, {
      method: "PATCH",
      body: JSON.stringify({ href, displayName }),
    }),
  deleteCollection: (serverId: number, href: string) =>
    request<{ success: boolean }>(`/api/servers/${serverId}/calendars`, {
      method: "DELETE",
      body: JSON.stringify({ href }),
    }),

  // Todos
  listTodos: (serverId: number, path?: string) => {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ""
    return request<{ todos: any[] }>(`/api/todos/${serverId}${qs}`)
  },
  createTodo: (serverId: number, data: TodoUpdate & { path?: string; href?: string }) => {
    const qs = data.path ? `?path=${encodeURIComponent(data.path)}` : ""
    return request<{ todo: any }>(`/api/todos/${serverId}${qs}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },
  updateTodo: (
    serverId: number,
    uid: string,
    data: TodoUpdate & { etag?: string; path?: string; href?: string },
  ) => {
    const qs = data.path ? `?path=${encodeURIComponent(data.path)}` : ""
    return request<{ todo: any }>(`/api/todos/${serverId}/${uid}${qs}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  },
  deleteTodo: (serverId: number, uid: string, path?: string, href?: string) => {
    const params = new URLSearchParams()
    if (path) params.set("path", path)
    if (href) params.set("href", href)
    const qs = params.toString() ? `?${params.toString()}` : ""
    return request<{ success: boolean }>(`/api/todos/${serverId}/${uid}${qs}`, { method: "DELETE" })
  },
}
