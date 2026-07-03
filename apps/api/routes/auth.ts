import { Hono } from "hono"
import type { APIContext } from "../_types.ts"
import { auth } from "../services/auth/+index.ts"
import { requireAuth } from "../middlewares/auth.ts"
import { db, rawDb } from "../services/db.ts"
import { config } from "../services/config.ts"
import { checkHash, hash } from "@shared/helpers/hash.ts"

export const authRoute = new Hono<APIContext>()
  // Sign up — username can be any string (no @ required)
  .post("/sign-up", async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password || password.length < 8) {
      return c.json({ error: "Username and password (min 8 chars) required" }, 400)
    }
    const result = await auth.signUp(username, password, c)
    if (!result) return c.json({ error: "Username already taken" }, 409)
    return c.json({ user: { id: result.user.id, email: result.user.email } }, 201)
  })
  // Sign in — with username (not email)
  .post("/sign-in", async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: "Username and password required" }, 400)
    const result = await auth.signIn(username, password, c)
    if (!result) return c.json({ error: "Invalid username or password" }, 401)
    return c.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        secondName: result.user.secondName,
      },
    })
  })
  .post("/sign-out", requireAuth, async (c) => {
    await auth.signOut(c)
    return c.json({ success: true })
  })
  // Get profile
  .get("/me", requireAuth, async (c) => {
    const a = c.get("auth")!
    return c.json({
      user: {
        id: a.user.id,
        email: a.user.email,
        firstName: a.user.firstName,
        secondName: a.user.secondName,
        role: a.user.role,
        username: a.key.identification,
      },
    })
  })
  // ─── Profile / Name + Email ──────────────────────────────────────────────
  .put("/profile", requireAuth, async (c) => {
    const a = c.get("auth")!
    const { email, firstName, secondName } = await c.req.json()
    if (email) {
      const existing = db.userKey.findByIdentification(email, 1)
      if (existing && existing.userId !== a.user.id) {
        return c.json({ error: "Email already in use" }, 409)
      }
    }
    rawDb.prepare(
      "UPDATE users SET email = COALESCE(?, email), first_name = COALESCE(?, first_name), second_name = COALESCE(?, second_name), updated_at = datetime('now') WHERE id = ?",
    ).run(email || null, firstName ?? null, secondName ?? null, a.user.id)
    return c.json({ success: true })
  })
  // ─── Change Username (login identifier) ─────────────────────────────────
  .put("/username", requireAuth, async (c) => {
    const a = c.get("auth")!
    const { newUsername, currentPassword } = await c.req.json()
    if (!newUsername || !currentPassword) {
      return c.json({ error: "newUsername and currentPassword required" }, 400)
    }
    const key = db.userKey.findByIdentification(a.key.identification, 1)
    if (!key || !(await checkHash(currentPassword, key.secret, config.authPepper))) {
      return c.json({ error: "Current password is incorrect" }, 401)
    }
    const existing = db.userKey.findByIdentification(newUsername, 1)
    if (existing) return c.json({ error: "Username already taken" }, 409)
    rawDb.prepare(
      "UPDATE user_keys SET identification = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(newUsername, key.id)
    return c.json({ success: true })
  })
  // ─── Delete Account ─────────────────────────────────────────────────────
  .delete("/user", requireAuth, async (c) => {
    const a = c.get("auth")!
    // Delete all server credentials
    rawDb.prepare("DELETE FROM server_credentials WHERE user_id = ?").run(a.user.id)
    // Soft-delete user (set deleted_at, prevents auth)
    rawDb.prepare(
      "UPDATE users SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    ).run(a.user.id)
    // Clear all sessions
    rawDb.prepare(
      "UPDATE user_sessions SET status = 2, updated_at = datetime('now') WHERE user_id = ? AND status = 1",
    ).run(a.user.id)
    // Clear session cookie
    const { deleteCookie } = await import("hono/cookie")
    deleteCookie(c, "session")
    return c.json({ success: true })
  })
  // ─── Change Password ────────────────────────────────────────────────────
  .put("/password", requireAuth, async (c) => {
    const a = c.get("auth")!
    const { currentPassword, newPassword } = await c.req.json()
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return c.json({ error: "Current and new password (min 8 chars) required" }, 400)
    }
    const key = db.userKey.findByIdentification(a.key.identification, 1)
    if (!key || !(await checkHash(currentPassword, key.secret, config.authPepper))) {
      return c.json({ error: "Current password is incorrect" }, 401)
    }
    const newHash = await hash(newPassword, config.authPepper)
    rawDb.prepare(
      "UPDATE user_keys SET secret = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(newHash, key.id)
    return c.json({ success: true })
  })
