/// <reference lib="deno.ns" />
import { extname, join } from "@std/path"
import { db, initDb } from "./+index.ts"

const DB_PATH = Deno.env.get("DB_PATH") || "./data/todoapp.db"
const MIGRATIONS_DIR = "./libs/server/db/migrations"

async function runMigrations() {
  initDb(DB_PATH)
  console.log(`📁 DB: ${DB_PATH}`)

  // Ensure migrations table exists
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  )

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map(
      (r: unknown) => (r as { name: string }).name,
    ),
  )

  const files = Array.from(Deno.readDirSync(MIGRATIONS_DIR))
    .filter((f) => extname(f.name) === ".sql")
    .map((f) => f.name.replace(".sql", ""))
    .filter((f) => !applied.has(f))
    .sort()

  if (files.length === 0) {
    console.log("✅ No new migrations.")
    Deno.exit(0)
  }

  console.log(`Applying ${files.length} migration(s):`)
  for (const file of files) {
    console.log(`  - ${file}`)
    const sql = Deno.readTextFileSync(join(MIGRATIONS_DIR, `${file}.sql`))
    db.transaction(() => {
      db.exec(sql)
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file)
    })()
    console.log(`    ✓ ${file} applied`)
  }

  console.log("✅ Migrations complete.")
  db.close()
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err)
  Deno.exit(1)
})
