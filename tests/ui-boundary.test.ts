/// <reference lib="deno.ns" />
/**
 * Holds every module in `libs/ui` to the screen contract in `AGENTS.md`: no store, no router, no
 * app import, no `fetch` or page global. Walks the folder, so a new file is checked without being
 * listed anywhere. The rule is `@spy4x/preact-system/boundary`; this repository adds its app
 * aliases and the `apps` folder.
 */

import { expect } from "@std/expect"
import { walk } from "@std/fs/walk"
import { fromFileUrl, relative } from "@std/path"
import { type BoundaryOptions, checkModule } from "@spy4x/preact-system/boundary"

const ROOT = fromFileUrl(new URL("../", import.meta.url))

/** What a screen here must not import beyond the library's defaults: any app's code. */
const OPTIONS: BoundaryOptions = {
  appAliases: ["@web/", "@server/"],
  appDirectories: ["apps"],
}

/** Every `.ts` and `.tsx` module in `libs/ui` but the tests, as absolute paths. */
async function uiModules(): Promise<string[]> {
  const files: string[] = []
  const entries = walk(`${ROOT}libs/ui`, {
    includeDirs: false,
    exts: [".ts", ".tsx"],
    skip: [/[\\/](node_modules|dist)[\\/]/, /\.test\.tsx?$/],
  })
  for await (const entry of entries) files.push(entry.path)
  return files.sort()
}

/** What the rule reports for `source` as a module of `libs/ui`. */
function report(source: string): string[] {
  return checkModule(source, { ...OPTIONS, filename: `${ROOT}libs/ui/screen.tsx` })
    .map((violation) => violation.message)
}

Deno.test("no module in libs/ui imports a store, router or app code or touches fetch or a page global", async () => {
  const files = await uiModules()
  // An empty walk would pass silently, so require a file the screens cannot lose.
  expect(files.map((file) => relative(ROOT, file))).toContain("libs/ui/frame.tsx")
  const found: string[] = []
  for (const file of files) {
    const source = await Deno.readTextFile(file)
    for (const violation of checkModule(source, { ...OPTIONS, filename: file })) {
      found.push(`${relative(ROOT, file)}: ${violation.message}`)
    }
  }
  expect(found).toEqual([])
})

Deno.test("the boundary refuses this repository's app aliases and a relative import into apps", () => {
  for (const alias of OPTIONS.appAliases ?? []) {
    expect(report(`import { x } from "${alias}x.ts"\nexport const y = x`)).toHaveLength(1)
  }
  expect(report(`import { x } from "../../apps/web/src/state/auth.ts"\nexport const y = x`))
    .toHaveLength(1)
  expect(report(`import { FORM_ACTIONS } from "./progressive.tsx"\nexport const l = FORM_ACTIONS`))
    .toEqual([])
})
