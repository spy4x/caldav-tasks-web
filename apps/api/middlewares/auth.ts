import type { MiddlewareHandler } from "hono"
import type { APIContext } from "../_types.ts"
import { auth } from "../services/auth/+index.ts"

export const parseAuth: MiddlewareHandler<APIContext> = async (c, next) => {
  const authData = await auth.getForRequest(c)
  if (authData) {
    c.set("auth", authData)
  }
  await next()
}

export const requireAuth: MiddlewareHandler<APIContext> = async (c, next) => {
  const authData = c.get("auth")
  if (!authData) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  await next()
}
