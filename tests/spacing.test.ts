/// <reference lib="deno.ns" />
import { registerSpacingTests } from "@spy4x/preact-theme/spacing-runner"

registerSpacingTests({
  test: Deno.test,
  root: new URL("../", import.meta.url),
  directories: ["apps", "libs"],
  skipDirectories: ["node_modules", "dist", "build", ".vite"],
  requiredFiles: ["apps/web/src/app.tsx"],
})
