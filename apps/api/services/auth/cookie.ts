import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { Context } from "hono"
import { config } from "../config.ts"

const SESSION_COOKIE = "todoapp_session"

export class CookieManager {
  getSessionIdToken(c: Context): string | null {
    return getCookie(c, SESSION_COOKIE) || null
  }

  set(c: Context, sessionIdToken: string, maxAgeSeconds?: number): void {
    setCookie(c, SESSION_COOKIE, sessionIdToken, {
      path: "/",
      maxAge: maxAgeSeconds ?? config.authSessionDurationMin * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProd && !Deno.env.get("COOKIE_INSECURE"),
    })
  }

  invalidate(c: Context): void {
    deleteCookie(c, SESSION_COOKIE)
  }
}
