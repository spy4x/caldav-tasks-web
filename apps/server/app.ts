import { Hono } from "hono"
import { serveStatic } from "@spy4x/server/static"
import { ApiErrorCode } from "@api/contract.ts"
import type { Config } from "./config.ts"

/** Where the SPA build lands: `apps/web/dist`, next to this file's folder. */
export const DEFAULT_STATIC_ROOT = new URL("../web/dist", import.meta.url).pathname

/** What `createApp` needs besides the configuration. */
export interface AppOptions {
  /** The folder with the built SPA. Defaults to `apps/web/dist`. */
  staticRoot?: string
}

/**
 * The server: `/health`, an empty `/api` that later issues fill, and the built SPA for every other
 * path. The configuration is loaded once at start and handed in here.
 */
export function createApp(_config: Config, options: AppOptions = {}): Hono {
  const staticRoot = options.staticRoot ?? DEFAULT_STATIC_ROOT
  const app = new Hono()

  app.get("/health", (c) => c.json({ status: "ok" }))

  // An unknown API path is a JSON 404, never the SPA's HTML.
  app.all("/api/*", (c) => c.json({ code: ApiErrorCode.NotFound, message: "Not found" }, 404))

  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname
    const response = await serveStatic(path, {
      root: staticRoot,
      spaFallback: true,
      method: c.req.method,
      // Vite names built files by content hash, so they never change; everything else, the
      // shell page included, is checked on every load.
      cacheControl: path.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    })
    return response ?? c.notFound()
  })

  return app
}
