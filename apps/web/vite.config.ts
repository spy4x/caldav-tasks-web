/// <reference lib="deno.ns" />
import { build, defineConfig } from "vite"
import { fromFileUrl } from "@std/path"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import tailwindcss from "@tailwindcss/vite"
import { themeBootstrapScript } from "@spy4x/preact-signals/theme"
import {
  npmSpecifiers,
  preactThemeCss,
  requireComponentCss,
  serviceWorker,
} from "@spy4x/preact-theme/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    npmSpecifiers({ readTextFile: Deno.readTextFile }),
    deno(),
    preact(),
    preactThemeCss(),
    tailwindcss(),
    requireComponentCss(),
    // The worker imports a JSR module, so it is bundled into dist/sw.js after the app build.
    serviceWorker({
      entry: fromFileUrl(new URL("./src/sw.ts", import.meta.url)),
      build,
      plugins: [deno()],
      readDir: Deno.readDir,
      readFile: Deno.readFile,
    }),
    {
      // Paints the stored (or system) light/dark choice before the first frame, so a dark reader
      // never sees a light flash. `index.html` cannot call the library, so the build injects it.
      name: "theme-bootstrap",
      transformIndexHtml: () => [{
        tag: "script",
        children: themeBootstrapScript(),
        injectTo: "head-prepend" as const,
      }],
    },
  ],
  // The version Settings shows. The release build sets `APP_VERSION` (the tag); without it the
  // build reads `development`.
  define: {
    __APP_VERSION__: JSON.stringify(Deno.env.get("APP_VERSION") || "development"),
  },
  resolve: {
    // Vite, not the Deno plugin, must load libs/ui: the Deno plugin compiles JSX for React, so a
    // screen loaded through it fails at runtime with "React is not defined".
    alias: [{
      find: /^@ui\//,
      replacement: fromFileUrl(new URL("../../libs/ui/", import.meta.url)),
    }],
  },
  optimizeDeps: {
    // These come in through the Deno plugin's resolver, which the dev server's dependency scan
    // does not follow: tailwind-merge (through the JSR package @spy4x/preact-cn) and arktype
    // (through the API contract). Found late, each triggers a re-bundle that leaves a page that
    // loaded meanwhile blank ("Outdated Optimize Dep"), so they are named up front.
    include: ["tailwind-merge", "arktype"],
  },
  server: {
    host: "0.0.0.0",
    // The API and the health check live on the app server (`deno task dev:server`).
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
    watch: {
      ignored: ["!../../libs/**"],
    },
  },
})
