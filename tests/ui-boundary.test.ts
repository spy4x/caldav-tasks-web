/// <reference lib="deno.ns" />
import { registerBoundaryTests } from "@spy4x/preact-system/boundary-runner"

registerBoundaryTests({
  test: Deno.test,
  root: new URL("../", import.meta.url),
  directories: ["libs/ui"],
  boundary: { appAliases: ["@web/", "@server/"], appDirectories: ["apps"] },
  requiredFiles: ["libs/ui/frame.tsx"],
  refusedImports: ["../../apps/web/src/state/auth.ts"],
  allowedImports: ["./due-label.ts"],
})
