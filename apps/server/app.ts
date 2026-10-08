import { Hono } from "hono"
import { serveStatic } from "@spy4x/server/static"
import { fromFileUrl } from "@std/path"
import { ApiErrorCode } from "@api/errors.ts"
import { authRoutes } from "./auth/routes.ts"
import { caldavRoutes } from "./caldav/routes.ts"
import type { Config } from "./config.ts"
import { securityHeaders } from "./security-headers.ts"

/** Where the SPA build lands: `apps/web/dist`, next to this file's folder. */
export const DEFAULT_STATIC_ROOT = fromFileUrl(new URL("../web/dist", import.meta.url))

/** What `createApp` needs besides the configuration. */
export interface AppOptions {
  /** The folder with the built SPA. Defaults to `apps/web/dist`. */
  staticRoot?: string
}

/**
 * The server: `/health`, an empty `/api` that later issues fill, and the built SPA for every other
 * path. The configuration is loaded once at start and handed in here.
 */
export async function createApp(_config: Config, options: AppOptions = {}): Promise<Hono> {
  const staticRoot = options.staticRoot ?? DEFAULT_STATIC_ROOT
  const app = new Hono()

  let shellHtml = ``
  try {
    shellHtml = await Deno.readTextFile(`${staticRoot}/index.html`)
  } catch (error) {
    // No build yet (development runs Vite instead): the policy then allows no inline code.
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  app.use(await securityHeaders(shellHtml))

  app.get("/health", (c) => c.json({ status: "ok" }))

  // Each lane owns one route module; they are empty until its issue fills them.
  app.route("/api/auth", authRoutes)
  app.route("/api/caldav", caldavRoutes)

  // An unknown API path is a JSON 404, never the SPA's HTML.
  app.all("/api/*", (c) => c.json({ code: ApiErrorCode.NotFound, message: "Not found" }, 404))

  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname
    const isAsset = path.startsWith("/assets/")
    const response = await serveStatic(path, {
      root: staticRoot,
      // A missing built file is a 404, never the shell: a stale hashed URL must not be cached
      // as HTML. Any other missing path is a route the SPA owns.
      spaFallback: !isAsset,
      method: c.req.method,
      // Vite names built files by content hash, so they never change; everything else, the
      // shell page included, is checked on every load.
      cacheControl: isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    })
    return response ?? c.notFound()
  })

  return app
}
