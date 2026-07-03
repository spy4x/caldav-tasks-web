import { Hono } from "hono"
import { cors } from "hono/cors"
import type { APIContext } from "./_types.ts"
import { config } from "./services/config.ts"
import { authRoute } from "./routes/auth.ts"
import { serversRoute } from "./routes/servers.ts"
import { todosRoute } from "./routes/todos.ts"
import { parseAuth } from "./middlewares/auth.ts"
import { getRandomString } from "@shared/helpers/random.ts"

const app = new Hono<APIContext>()

// Global middleware
app.use("*", cors({ origin: config.corsOrigin, credentials: true }))
app.use("*", async (c, next) => {
  c.set("requestId", getRandomString(8))
  await next()
})
app.use("*", parseAuth)

// Health
app.get("/api/health", (c) => c.json({ status: "ok", date: Date.now() }))

// Routes
app.route("/api/auth", authRoute)
app.route("/api/servers", serversRoute)
app.route("/api/todos", todosRoute)

// In production, serve static files
if (!config.isDev) {
  app.use("/*", async (c, next) => {
    try {
      const filePath = c.req.path === "/" ? "/index.html" : c.req.path
      const file = await Deno.readFile(`./apps/web/dist${filePath}`)
      const ext = filePath.split(".").pop() || ""
      const mime: Record<string, string> = {
        html: "text/html",
        js: "application/javascript",
        css: "text/css",
        json: "application/json",
        png: "image/png",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        webmanifest: "application/manifest+json",
      }
      return c.newResponse(file, 200, {
        "Content-Type": mime[ext] || "application/octet-stream",
        "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=31536000, immutable",
      })
    } catch {
      // SPA fallback
      try {
        const file = await Deno.readFile(`./apps/web/dist/index.html`)
        return c.newResponse(file, 200, { "Content-Type": "text/html" })
      } catch {
        return c.json({ error: "Not found" }, 404)
      }
    }
  })
}

// Start server
Deno.serve({ port: config.port }, app.fetch)

console.log(`🚀 TodoApp API running on :${config.port} (${config.env})`)
