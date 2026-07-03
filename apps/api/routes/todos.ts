import { Hono } from "hono"
import type { APIContext } from "../_types.ts"
import { db } from "../services/db.ts"
import { config } from "../services/config.ts"
import { requireAuth } from "../middlewares/auth.ts"
import { decrypt } from "@shared/helpers/encrypt.ts"
import { getAdapter } from "../services/caldav/+index.ts"
import { buildNewVtodo, buildVtodoFromUpdate } from "../services/caldav/parse.ts"
import type { ServerType, TodoUpdate } from "@shared/types"

export const todosRoute = new Hono<APIContext>()
  .use(requireAuth)
  // List todos from a server's calendar
  .get("/:serverId", async (c) => {
    const a = c.get("auth")!
    const serverId = parseInt(c.req.param("serverId"))
    const calendarPath = c.req.query("path")
    const server = db.serverCredentials.findById(serverId)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Server not found" }, 404)
    }
    const cp = calendarPath || server.calendarPath
    if (!cp) return c.json({ error: "Calendar not configured" }, 400)

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      const todos = await adapter.getTodos(
        server.baseUrl,
        server.username,
        password,
        cp,
        serverId,
      )
      return c.json({ todos })
    } catch (err) {
      return c.json({ error: `Failed to fetch todos: ${(err as Error).message}` }, 502)
    }
  })
  // List todos from ALL calendars on a server
  .get("/:serverId/all", async (c) => {
    const a = c.get("auth")!
    const serverId = parseInt(c.req.param("serverId"))
    const server = db.serverCredentials.findById(serverId)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Server not found" }, 404)
    }
    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)

    // Discover all VTODO calendars
    try {
      const userPath = server.serverType === 2
        ? `/dav/cal/${server.username}/`
        : `/${server.username}/`
      const calendars = await adapter.getCalendars(
        server.baseUrl,
        server.username,
        password,
        userPath,
      )
      const allTodos: any[] = []
      for (const cal of calendars) {
        try {
          const todos = await adapter.getTodos(
            server.baseUrl,
            server.username,
            password,
            cal.href,
            serverId,
          )
          allTodos.push(...todos.map((t) => ({ ...t, collectionName: cal.displayName })))
        } catch {
          continue
        }
      }
      return c.json({ todos: allTodos })
    } catch (err) {
      return c.json({ error: `Failed: ${(err as Error).message}` }, 502)
    }
  })
  // Create a todo
  .post("/:serverId", async (c) => {
    const a = c.get("auth")!
    const serverId = parseInt(c.req.param("serverId"))
    const calendarPath = c.req.query("path") || ""
    const server = db.serverCredentials.findById(serverId)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Server not found" }, 404)
    }
    const cp = calendarPath || server.calendarPath
    if (!cp) return c.json({ error: "Calendar not configured" }, 400)

    const data = await c.req.json() as TodoUpdate & { path?: string }
    const ical = buildNewVtodo(
      data.summary || "Untitled",
      data.description,
      data.status,
      data.priority,
      data.due,
      data.categories,
      data.location,
      data.rrule,
      data.startDate,
    )

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      const uid = ical.match(/UID:(.+)/)?.[1]?.trim() || crypto.randomUUID()
      const etag = await adapter.putTodo(
        server.baseUrl,
        server.username,
        password,
        cp,
        uid,
        ical,
      )
      return c.json({
        todo: {
          uid,
          summary: data.summary,
          description: data.description,
          status: data.status ?? 1,
          priority: data.priority ?? 0,
          due: data.due,
          categories: data.categories || [],
          location: data.location || "",
          rrule: data.rrule || "",
          etag,
          serverId,
          collectionHref: cp,
        },
      }, 201)
    } catch (err) {
      return c.json({ error: `Failed to create todo: ${(err as Error).message}` }, 502)
    }
  })
  // Update a todo
  .put("/:serverId/:uid", async (c) => {
    const a = c.get("auth")!
    const serverId = parseInt(c.req.param("serverId"))
    const uid = c.req.param("uid")
    const calendarPath = c.req.query("path") || ""
    const server = db.serverCredentials.findById(serverId)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Server not found" }, 404)
    }
    const cp = calendarPath || server.calendarPath
    if (!cp) return c.json({ error: "Calendar not configured" }, 400)

    const data = await c.req.json() as TodoUpdate & { etag?: string; href?: string }
    const ical = buildVtodoFromUpdate(uid, data)

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      const href = data.href
      const newEtag = await adapter.putTodo(
        server.baseUrl,
        server.username,
        password,
        cp,
        uid,
        ical,
        data.etag,
        href,
      )
      return c.json({
        todo: { uid, ...data, etag: newEtag },
      })
    } catch (err) {
      return c.json({ error: `Failed to update todo: ${(err as Error).message}` }, 502)
    }
  })
  // Delete a todo
  .delete("/:serverId/:uid", async (c) => {
    const a = c.get("auth")!
    const serverId = parseInt(c.req.param("serverId"))
    const uid = c.req.param("uid")
    const calendarPath = c.req.query("path") || ""
    const server = db.serverCredentials.findById(serverId)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Server not found" }, 404)
    }
    const cp = calendarPath || server.calendarPath
    if (!cp) return c.json({ error: "Calendar not configured" }, 400)

    const href = c.req.query("href") || undefined

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      await adapter.deleteTodo(server.baseUrl, server.username, password, cp, uid, undefined, href)
      return c.json({ success: true })
    } catch (err) {
      return c.json({ error: `Failed to delete todo: ${(err as Error).message}` }, 502)
    }
  })
