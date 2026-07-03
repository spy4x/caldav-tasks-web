import { checkHash, hash } from "@shared/helpers/hash.ts"
import { getRandomString } from "@shared/helpers/random.ts"
import type { User, UserSession } from "@shared/types"
import { config } from "../config.ts"
import { db } from "../db.ts"

export class SessionManager {
  async create(
    userId: number,
    keyId: number,
  ): Promise<{ session: UserSession; rawToken: string }> {
    const rawToken = getRandomString(config.authSessionLength)
    const tokenHash = await hash(rawToken, config.authPepper)
    const expiresAt = new Date(
      Date.now() + config.authSessionDurationMin * 60 * 1000,
    )

    const session = db.userSession.create(
      tokenHash,
      userId,
      keyId,
      expiresAt.toISOString(),
    )
    if (!session) throw new Error("Failed to create session")

    return { session: { ...session, token: rawToken }, rawToken }
  }

  async validate(
    sessionIdToken: string,
  ): Promise<{ session: UserSession; user: User } | null> {
    const parts = sessionIdToken.split(":")
    if (parts.length !== 2) return null
    const [idStr, token] = parts
    const id = parseInt(idStr)
    if (!id || !token) return null

    const session = db.userSession.findById(id)
    if (
      !session || session.status !== 1 ||
      new Date(session.expiresAt) < new Date()
    ) {
      return null
    }

    if (!(await checkHash(token, session.token, config.authPepper))) {
      return null
    }

    const user = db.user.findById(session.userId)
    if (!user) return null

    // Extend session if < 1/4 remaining
    const expiresAt = new Date(session.expiresAt)
    const remaining = expiresAt.getTime() - Date.now()
    if (remaining < (config.authSessionDurationMin * 60 * 1000) / 4) {
      const newExpires = new Date(
        Date.now() + config.authSessionDurationMin * 60 * 1000,
      )
      db.userSession.update(session.id, session.status)
      // In a real app, update expires_at here
    }

    return { session, user }
  }

  getIdTokenForCookie(session: UserSession): string {
    return `${session.id}:${session.token}`
  }

  async delete(sessionIdToken: string): Promise<void> {
    const parts = sessionIdToken.split(":")
    const id = parseInt(parts[0])
    if (id) {
      db.userSession.update(id, 3) // signed_out
    }
  }
}
