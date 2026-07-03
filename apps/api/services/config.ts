/// <reference lib="deno.ns" />

export class Config {
  env = Deno.env.get("ENV") || "dev"
  port = parseInt(Deno.env.get("PORT") || "8080")
  dbPath = Deno.env.get("DB_PATH") || "./data/todoapp.db"
  authPepper = Deno.env.get("AUTH_PEPPER") || "dev-pepper-change-in-prod"
  authCookieSecret = Deno.env.get("AUTH_COOKIE_SECRET") ||
    "dev-cookie-secret-change-in-prod"
  authSessionLength = 32
  authSessionDurationMin = 60 * 24 * 30 * 2 // 2 months
  encryptionSecret = Deno.env.get("ENCRYPTION_SECRET") ||
    "dev-encryption-change-in-prod"
  corsOrigin = Deno.env.get("CORS_ORIGIN") || "http://localhost:5173"

  get isDev() {
    return this.env === "dev"
  }
  get isProd() {
    return this.env === "prod"
  }
}

export const config = new Config()
