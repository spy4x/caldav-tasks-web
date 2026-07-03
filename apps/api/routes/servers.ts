import { Hono } from "hono"
import type { APIContext } from "../_types.ts"
import { db } from "../services/db.ts"
import { config } from "../services/config.ts"
import { requireAuth } from "../middlewares/auth.ts"
import { decrypt, encrypt } from "@shared/helpers/encrypt.ts"
import { getAdapter } from "../services/caldav/+index.ts"
import type { ServerType } from "@shared/types"

export const serversRoute = new Hono<APIContext>()
  .use(requireAuth)
  // List servers
  .get("/", async (c) => {
    const a = c.get("auth")!
    const servers = db.serverCredentials.findByUser(a.user.id)
    const decrypted = await Promise.all(servers.map(async (s) => ({
      ...s,
      password: await decrypt(s.password, config.encryptionSecret),
    })))
    return c.json({ servers: decrypted })
  })
  // Add server
  .post("/", async (c) => {
    const a = c.get("auth")!
    const {
      name,
      baseUrl,
      username,
      password,
      calendarPath,
      serverType,
    } = await c.req.json()
    if (!baseUrl || !username || !password) {
      return c.json({ error: "baseUrl, username, password required" }, 400)
    }
    const st = (typeof serverType === "number" && (serverType === 1 || serverType === 2))
      ? serverType
      : 1
    const encrypted = await encrypt(password, config.encryptionSecret)
    const server = db.serverCredentials.create(
      a.user.id,
      name || "CalDAV",
      st,
      baseUrl,
      username,
      encrypted,
      calendarPath || null,
    )
    return c.json({ server }, 201)
  })
  // Update server
  .patch("/:id", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    const existing = db.serverCredentials.findById(id)
    if (!existing || existing.userId !== a.user.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const updates = await c.req.json() as Record<string, string>
    if (updates.password) {
      updates.password = await encrypt(updates.password, config.encryptionSecret)
    }
    db.serverCredentials.update(id, updates as any)
    return c.json({ success: true })
  })
  // Delete server
  .delete("/:id", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    db.serverCredentials.delete(id, a.user.id)
    return c.json({ success: true })
  })
  // ─── Collection Management ───────────────────────────────────────────────

  // Discover calendars on server
  .get("/:id/calendars", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    const server = db.serverCredentials.findById(id)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)

    // Determine user path based on server type
    // Radicale: / or /<username>/
    // Stalwart: /dav/cal/<email>/
    const userPath = server.serverType === 2
      ? `/dav/cal/${server.username}/`
      : `/${server.username}/`

    try {
      const calendars = await adapter.getCalendars(
        server.baseUrl,
        server.username,
        password,
        userPath,
      )
      return c.json({ calendars })
    } catch (err) {
      return c.json({ error: `Failed: ${(err as Error).message}` }, 502)
    }
  })
  // Create a new collection on the server
  .post("/:id/calendars", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    const server = db.serverCredentials.findById(id)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const { displayName } = await c.req.json()
    if (!displayName) return c.json({ error: "displayName required" }, 400)

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)

    const userPath = server.serverType === 2
      ? `/dav/cal/${server.username}/`
      : `/${server.username}/`

    try {
      const href = await adapter.createCollection(
        server.baseUrl,
        server.username,
        password,
        userPath,
        displayName,
      )
      return c.json({ collection: { href, displayName } }, 201)
    } catch (err) {
      return c.json({ error: `Failed to create collection: ${(err as Error).message}` }, 502)
    }
  })
  // Update collection display name
  .patch("/:id/calendars", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    const server = db.serverCredentials.findById(id)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const { href, displayName } = await c.req.json()
    if (!href || !displayName) return c.json({ error: "href and displayName required" }, 400)

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      await adapter.proppatchCollection(
        server.baseUrl,
        server.username,
        password,
        href,
        displayName,
      )
      return c.json({ success: true })
    } catch (err) {
      return c.json({ error: `Failed: ${(err as Error).message}` }, 502)
    }
  })
  // Delete a collection from the server
  .delete("/:id/calendars", async (c) => {
    const a = c.get("auth")!
    const id = parseInt(c.req.param("id"))
    const server = db.serverCredentials.findById(id)
    if (!server || server.userId !== a.user.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const { href } = await c.req.json()
    if (!href) return c.json({ error: "href required" }, 400)

    const password = await decrypt(server.password, config.encryptionSecret)
    const adapter = getAdapter(server.serverType as ServerType)
    try {
      await adapter.deleteCollection(server.baseUrl, server.username, password, href)
      return c.json({ success: true })
    } catch (err) {
      return c.json({ error: `Failed: ${(err as Error).message}` }, 502)
    }
  })
