import { Database } from "@db/sqlite"
import type { ServerCredentials, User, UserKey, UserSession } from "@shared/types"
import { config } from "./config.ts"

const rawDb = new Database(config.dbPath)
rawDb.exec("PRAGMA journal_mode = WAL")
rawDb.exec("PRAGMA foreign_keys = ON")

// SQLite returns snake_case columns. Map to camelCase for our types.
function mapRow<T>(row: Record<string, unknown> | undefined): T | null {
  if (!row) return null
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = value
  }
  return result as T
}

function mapRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => mapRow<T>(r)!)
}

export class DbService {
  user = {
    findById: (id: number): User | null =>
      mapRow<User>(
        rawDb.prepare("SELECT * FROM users WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined,
      ),

    findByEmail: (email: string): User | null =>
      mapRow<User>(
        rawDb.prepare("SELECT * FROM users WHERE email = ?").get(email) as
          | Record<string, unknown>
          | undefined,
      ),

    create: (email: string, role: number): User | null => {
      rawDb.prepare("INSERT INTO users (email, role) VALUES (?, ?)").run(email, role)
      return rawDb.prepare("SELECT * FROM users WHERE email = ?").get(email)
        ? mapRow<User>(
          rawDb.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<
            string,
            unknown
          >,
        )
        : null
    },

    updateLastLogin: (id: number): void => {
      rawDb.prepare(
        "UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(id)
    },
  }

  userKey = {
    findById: (id: number): UserKey | null =>
      mapRow<UserKey>(
        rawDb.prepare("SELECT * FROM user_keys WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined,
      ),

    findByIdentification: (identification: string, kind: number): UserKey | null =>
      mapRow<UserKey>(
        rawDb.prepare("SELECT * FROM user_keys WHERE identification = ? AND kind = ?")
          .get(identification, kind) as Record<string, unknown> | undefined,
      ),

    create: (
      userId: number,
      kind: number,
      identification: string,
      secret: string,
    ): UserKey | null => {
      rawDb.prepare(
        "INSERT INTO user_keys (user_id, kind, identification, secret) VALUES (?, ?, ?, ?)",
      ).run(userId, kind, identification, secret)
      return mapRow<UserKey>(
        rawDb.prepare("SELECT * FROM user_keys WHERE identification = ? AND kind = ?")
          .get(identification, kind) as Record<string, unknown> | undefined,
      )
    },
  }

  userSession = {
    findById: (id: number): UserSession | null =>
      mapRow<UserSession>(
        rawDb.prepare("SELECT * FROM user_sessions WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined,
      ),

    create: (
      token: string,
      userId: number,
      keyId: number,
      expiresAt: string,
    ): UserSession | null => {
      rawDb.prepare(
        "INSERT INTO user_sessions (token, user_id, key_id, expires_at) VALUES (?, ?, ?, ?)",
      ).run(token, userId, keyId, expiresAt)
      return mapRow<UserSession>(
        rawDb.prepare("SELECT * FROM user_sessions WHERE token = ?").get(token) as
          | Record<string, unknown>
          | undefined,
      )
    },

    findByToken: (token: string): UserSession | null =>
      mapRow<UserSession>(
        rawDb.prepare("SELECT * FROM user_sessions WHERE token = ?").get(token) as
          | Record<string, unknown>
          | undefined,
      ),

    update: (id: number, status: number): void => {
      rawDb.prepare(
        "UPDATE user_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(status, id)
    },

    expireOld: (): void => {
      rawDb.prepare(
        "UPDATE user_sessions SET status = 2, updated_at = datetime('now') WHERE expires_at < datetime('now') AND status = 1",
      ).run()
    },
  }

  serverCredentials = {
    findByUser: (userId: number): ServerCredentials[] =>
      mapRows<ServerCredentials>(
        rawDb.prepare("SELECT * FROM server_credentials WHERE user_id = ? ORDER BY created_at DESC")
          .all(userId) as Record<string, unknown>[],
      ),

    findById: (id: number): ServerCredentials | null =>
      mapRow<ServerCredentials>(
        rawDb.prepare("SELECT * FROM server_credentials WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined,
      ),

    create: (
      userId: number,
      name: string,
      serverType: number,
      baseUrl: string,
      username: string,
      password: string,
      calendarPath: string | null,
    ): ServerCredentials | null => {
      rawDb.prepare(
        `INSERT INTO server_credentials (user_id, name, server_type, base_url, username, password, calendar_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(userId, name, serverType, baseUrl, username, password, calendarPath)
      const rows = rawDb.prepare(
        "SELECT * FROM server_credentials WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
        .all(userId) as Record<string, unknown>[]
      return mapRow<ServerCredentials>(rows[0])
    },

    update: (
      id: number,
      data: Partial<
        Pick<ServerCredentials, "name" | "baseUrl" | "username" | "password" | "calendarPath">
      >,
    ): void => {
      const sets: string[] = []
      const params: (string | number | null)[] = []
      if (data.name !== undefined) {
        sets.push("name = ?")
        params.push(data.name)
      }
      if (data.baseUrl !== undefined) {
        sets.push("base_url = ?")
        params.push(data.baseUrl)
      }
      if (data.username !== undefined) {
        sets.push("username = ?")
        params.push(data.username)
      }
      if (data.password !== undefined) {
        sets.push("password = ?")
        params.push(data.password)
      }
      if (data.calendarPath !== undefined) {
        sets.push("calendar_path = ?")
        params.push(data.calendarPath)
      }
      sets.push("updated_at = datetime('now')")
      params.push(id)
      rawDb.prepare(`UPDATE server_credentials SET ${sets.join(", ")} WHERE id = ?`).run(...params)
    },

    delete: (id: number, userId: number): void => {
      rawDb.prepare("DELETE FROM server_credentials WHERE id = ? AND user_id = ?").run(id, userId)
    },
  }
}

export const db = new DbService()
export { rawDb }
console.log(`✅ SQLite DB connected: ${config.dbPath}`)
