/// <reference lib="deno.ns" />
import { registerBoundaryTests } from "@spy4x/preact-system/boundary-runner"

registerBoundaryTests({
  test: Deno.test,
  root: new URL("../", import.meta.url),
  directories: ["libs/ui"],
  skipDirectories: ["node_modules", "dist"],
  boundary: { appAliases: ["@web/", "@server/"], appDirectories: ["apps"] },
  requiredFiles: ["libs/ui/frame.tsx"],
  refusedImports: ["@web/x.ts", "@server/x.ts", "../../apps/web/src/state/auth.ts"],
  allowedImports: ["./due-label.ts"],
})
