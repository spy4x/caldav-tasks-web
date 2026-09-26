import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [deno(), preact(), tailwindcss()],
  server: {
    port: 5173,
    // The API runs on :8080 in dev; the app calls it on the same origin as /api/*.
    proxy: { "/api": "http://localhost:8080" },
  },
  build: { outDir: "dist" },
  publicDir: "static",
})
