import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [deno(), preact(), tailwindcss()],
  server: { port: 5173 },
  build: { outDir: "dist" },
  publicDir: "static",
})
