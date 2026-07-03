import { Database } from "@db/sqlite"

export let db: Database

export function initDb(path: string): Database {
  db = new Database(path)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  return db
}

export class DbServiceBase {
  protected get db() {
    return db
  }

  /** Run a raw SQL query with params, returning rows as objects */
  query<T>(sql: string, ...params: unknown[]): T[] {
    return db.prepare(sql).all(...params) as T[]
  }

  /** Run a SQL statement, returning the number of changed rows */
  execute(sql: string, ...params: unknown[]): number {
    const stmt = db.prepare(sql)
    const result = stmt.run(...params)
    return db.changes
  }

  /** Get a single row or null */
  one<T>(sql: string, ...params: unknown[]): T | null {
    const row = db.prepare(sql).get(...params) as T | undefined
    return row ?? null
  }

  /** Run a function inside a transaction */
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)()
  }

  async isConnected(): Promise<boolean> {
    try {
      db.prepare("SELECT 1").get()
      return true
    } catch {
      return false
    }
  }
}
