import { checkHash, hash } from "@shared/helpers/hash.ts"
import type { Context } from "hono"
import type { APIContext, AuthData } from "../../_types.ts"
import { db } from "../db.ts"
import { config } from "../config.ts"
import { CookieManager } from "./cookie.ts"
import { SessionManager } from "./session.ts"

const cookie = new CookieManager()
const session = new SessionManager()

export const auth = {
  async getForRequest(c: Context<APIContext>): Promise<AuthData | null> {
    const sessionIdToken = cookie.getSessionIdToken(c)
    if (!sessionIdToken) return null
    const result = await session.validate(sessionIdToken)
    if (!result) {
      cookie.invalidate(c)
      return null
    }
    const key = db.userKey.findById(result.session.keyId)
    if (!key) {
      cookie.invalidate(c)
      return null
    }
    return { user: result.user, key, session: result.session }
  },

  async signUp(
    username: string,
    password: string,
    c: Context<APIContext>,
  ): Promise<AuthData | null> {
    const existing = db.userKey.findByIdentification(username, 1)
    if (existing) return null

    const user = db.user.create(`${username}@local`, 4) // placeholder email
    if (!user) return null
    const passwordHash = await hash(password, config.authPepper)
    const key = db.userKey.create(user.id, 1, username, passwordHash)
    if (!key) return null

    const { session: sess, rawToken } = await session.create(user.id, key.id)
    cookie.set(c, session.getIdTokenForCookie(sess))
    db.user.updateLastLogin(user.id)
    return { user: db.user.findById(user.id)!, key, session: { ...sess, token: rawToken } }
  },

  async signIn(
    username: string,
    password: string,
    c: Context<APIContext>,
  ): Promise<AuthData | null> {
    const key = db.userKey.findByIdentification(username, 1)
    if (!key) return null
    if (!(await checkHash(password, key.secret, config.authPepper))) return null
    const user = db.user.findById(key.userId)
    if (!user) return null
    const { session: sess, rawToken } = await session.create(user.id, key.id)
    cookie.set(c, session.getIdTokenForCookie(sess))
    db.user.updateLastLogin(user.id)
    return { user: db.user.findById(user.id)!, key, session: { ...sess, token: rawToken } }
  },

  async signOut(c: Context<APIContext>): Promise<void> {
    const sessionIdToken = cookie.getSessionIdToken(c)
    cookie.invalidate(c)
    if (sessionIdToken) await session.delete(sessionIdToken)
  },
}
