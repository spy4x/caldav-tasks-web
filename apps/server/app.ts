import { Hono } from "hono"
import { serveStatic } from "@spy4x/server/static"
import { fromFileUrl } from "@std/path"
import { ApiErrorCode } from "@api/errors.ts"
import { type AuthOptions, createAuth } from "./auth/routes.ts"
import { type CalDavRoutesOptions, createCaldavRoutes } from "./caldav/routes.ts"
import type { Config } from "./config.ts"
import { securityHeaders } from "./security-headers.ts"

/** Where the SPA build lands: `apps/web/dist`, next to this file's folder. */
export const DEFAULT_STATIC_ROOT = fromFileUrl(new URL("../web/dist", import.meta.url))

/** What `createApp` needs besides the configuration. */
export interface AppOptions {
  /** The folder with the built SPA. Defaults to `apps/web/dist`. */
  staticRoot?: string
  /** Test seams for sign-in, such as the clock. */
  auth?: AuthOptions
  /** Test seams for the CalDAV relay, such as the client. */
  caldav?: CalDavRoutesOptions
}

/**
 * The server: `/health`, `/api` behind the owner's session, and the built SPA for every other path.
 * The configuration is loaded once at start and handed in here.
 */
export async function createApp(config: Config, options: AppOptions = {}): Promise<Hono> {
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

  // Sign-in is the one API route open without a session. Everything registered after the guard,
  // the unknown-path 404 included, needs a valid session cookie, and a same-origin request for any
  // method but GET, HEAD and OPTIONS.
  const auth = createAuth(config, options.auth)
  app.route("/api/auth", auth.signInRoutes)
  app.use("/api/*", ...auth.guard)

  // Each lane owns one route module.
  app.route("/api/auth", auth.routes)
  app.route("/api/caldav", createCaldavRoutes(config, options.caldav))

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
