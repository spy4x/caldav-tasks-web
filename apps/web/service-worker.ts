import { build, type Plugin } from "vite"
import deno from "@deno/vite-plugin"
import { fromFileUrl } from "@std/path"
import { buildIdOf } from "./build-id.ts"

/** Every file below `dir` except the worker itself, keyed by its path relative to `dir`. */
async function readBuild(dir: string, base = dir): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory) {
      for (const [key, value] of await readBuild(path, base)) files.set(key, value)
    } else if (path !== `${base}/sw.js`) {
      files.set(path.slice(base.length), await Deno.readFile(path))
    }
  }
  return files
}

/**
 * Builds `src/sw.ts` into `dist/sw.js` after the app build. The worker imports a JSR module and a
 * browser cannot load that, so it is bundled into one classic script. `__BUILD_ID__` is a hash of
 * the rest of `dist`, so the worker file changes (and browsers see an update) exactly when a
 * shipped file does.
 */
export function serviceWorker(): Plugin {
  let outDir = ``
  return {
    name: `service-worker`,
    apply: `build`,
    configResolved: (config) => {
      outDir = config.build.outDir.startsWith(`/`)
        ? config.build.outDir
        : fromFileUrl(new URL(config.build.outDir, `file://${config.root}/`))
    },
    async closeBundle() {
      const id = await buildIdOf(await readBuild(outDir))
      await build({
        configFile: false,
        publicDir: false,
        logLevel: `warn`,
        plugins: [deno()],
        define: { __BUILD_ID__: JSON.stringify(id) },
        build: {
          outDir,
          emptyOutDir: false,
          lib: {
            entry: fromFileUrl(new URL(`./src/sw.ts`, import.meta.url)),
            formats: [`iife`],
            name: `sw`,
            fileName: () => `sw.js`,
          },
        },
      })
    },
  }
}
