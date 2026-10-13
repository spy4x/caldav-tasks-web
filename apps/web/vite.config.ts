/// <reference lib="deno.ns" />
import { build, defineConfig, type Plugin } from "vite"
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

/**
 * Gives a module the Deno plugin loads one id per file, whatever specifier imported it.
 *
 * The Deno plugin puts the specifier into the module id (`\0deno::<type>::<specifier>::<file>#deno`),
 * and for a JSR import that specifier is `jsr:…` or the final `https://jsr.io/…` address depending
 * on whether its loader has met the package yet. That is a matter of timing, so the same sources
 * gave a bundle with a different number of copies of a module on each build. With the file as the
 * specifier, every build gives the same bundle, and a module the Deno plugin loads is in it once.
 * A file that Vite also loads by its plain path never gets such an id, so it is still in the bundle
 * twice: `libs/api/errors.ts` today, as before this plugin.
 */
function oneModulePerFile(): Plugin {
  return {
    name: "one-module-per-file",
    enforce: "pre",
    async resolveId(id, importer, options) {
      const resolved = await this.resolve(id, importer, { ...options, skipSelf: true })
      if (!resolved?.id.startsWith("\0deno::")) return resolved
      const [prefix, mediaType, _specifier, ...file] = resolved.id.split("::")
      const path = file.join("::")
      return { ...resolved, id: [prefix, mediaType, path.replace(/#deno$/, ""), path].join("::") }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    npmSpecifiers({ readTextFile: Deno.readTextFile }),
    oneModulePerFile(),
    deno(),
    preact(),
    preactThemeCss(),
    tailwindcss(),
    requireComponentCss(),
    // The worker imports a JSR module, so it is bundled into dist/sw.js after the app build.
    serviceWorker({
      entry: fromFileUrl(new URL("./src/sw.ts", import.meta.url)),
      build,
      plugins: [oneModulePerFile(), deno()],
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
    // Vite, not the Deno plugin, loads libs/ui. Version 1 of the Deno plugin compiled JSX for
    // React, so a screen loaded through it failed at runtime with "React is not defined". A build
    // with version 2 and no alias holds no `React` call, but the browser tests have never run
    // against such a build, so the alias stays.
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
