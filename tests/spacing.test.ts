/// <reference lib="deno.ns" />
/**
 * Holds every spacing class in `apps/` and `libs/` to the scale `@spy4x/preact-theme/spacing`
 * owns: padding, margin, gap, `space-x/y` and scroll spacing use only its steps, never an
 * arbitrary value. The library's `docs/spacing.md` says which step goes where.
 */

import { findOffScaleSpacing } from "@spy4x/preact-theme/spacing"
import { expect } from "@std/expect"
import { walk } from "@std/fs/walk"
import { fromFileUrl, relative } from "@std/path"

const ROOT = fromFileUrl(new URL("../", import.meta.url))

/** Source directories to check. */
const SOURCE_DIRS = ["apps", "libs"]

/**
 * Build output and caches, which hold compiled classes rather than source, and test files, which
 * spell out classes to assert on. `walk` tests these against the absolute path, so the directory
 * pattern is anchored below `root`: a checkout under a parent named `build/` must still be walked.
 */
function skipPatterns(root: string): RegExp[] {
  const below = root.replace(/[\\^$.*+?()[\]{}|/]/g, `\\$&`)
  return [
    new RegExp(`^${below}(.*[\\\\/])?(node_modules|dist|build|\\.vite)[\\\\/]`),
    /\.test\.tsx?$/,
  ]
}

/** Every source file under {@link SOURCE_DIRS} in `root`, relative to `root`. */
async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = []
  for (const dir of SOURCE_DIRS) {
    const entries = walk(`${root}${dir}`, {
      includeDirs: false,
      exts: [".ts", ".tsx", ".css", ".html"],
      skip: skipPatterns(root),
    })
    for await (const entry of entries) files.push(relative(root, entry.path))
  }
  return files.sort()
}

Deno.test("skips build output below the root, not the root's own parents", () => {
  const root = `/home/me/worktrees/template/build/fix-x/`
  const skipped = (path: string) => skipPatterns(root).some((p) => p.test(path))
  expect(skipped(`${root}apps/web/src/app.tsx`)).toBe(false)
  expect(skipped(`${root}apps/web/dist/assets/index.js`)).toBe(true)
  expect(skipped(`${root}apps/web/.vite/server.js`)).toBe(true)
  expect(skipped(`${root}node_modules/x/index.ts`)).toBe(true)
  expect(skipped(`${root}libs/ui/screens.test.tsx`)).toBe(true)
})

Deno.test("escapes regex characters and backslashes in the root", () => {
  for (const root of [`/home/a+b (1)/build/x/`, `C:\\Users\\me\\build\\x\\`]) {
    const sep = root.endsWith(`\\`) ? `\\` : `/`
    const skipped = (path: string) => skipPatterns(root).some((p) => p.test(path))
    expect(skipped(`${root}apps${sep}web${sep}src${sep}app.tsx`)).toBe(false)
    expect(skipped(`${root}apps${sep}web${sep}dist${sep}index.js`)).toBe(true)
  }
})

Deno.test("every spacing class in apps/ and libs/ is on the scale", async () => {
  const files = await sourceFiles(ROOT)
  // An empty walk would pass silently, so require a file the SPA cannot lose.
  expect(files).toContain("apps/web/src/app.tsx")
  const found: string[] = []
  for (const file of files) {
    for (const v of findOffScaleSpacing(await Deno.readTextFile(`${ROOT}${file}`))) {
      found.push(`${file}:${v.line}:${v.column} ${v.className} — ${v.reason}`)
    }
  }
  expect(found).toEqual([])
})
