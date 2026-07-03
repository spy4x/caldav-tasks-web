/// <reference lib="deno.ns" />
// Deploy to homelab: rsync + docker compose
// Prerequisites: deno task web:build (run separately)
// Usage: deno run -R=./infra --allow-run=rsync,ssh ./infra/scripts/deploy.ts

import { error, log, success } from "./+lib.ts"

const envFilePath = "./infra/envs/.env.prod"
let env: string
try {
  env = await Deno.readTextFile(envFilePath)
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    error(`Env file not found: ${envFilePath}`)
    Deno.exit(1)
  } else {
    throw err
  }
}
const envVars = Object.fromEntries(
  env.split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => line.split("=").map((part) => part.trim())),
)

const SSH_TO_SERVER = envVars["SSH_TO_SERVER"] as string
const PATH_ON_SERVER = envVars["PATH_ON_SERVER"] as string

if (!SSH_TO_SERVER || !PATH_ON_SERVER) {
  error(`SSH_TO_SERVER and PATH_ON_SERVER must be set in ${envFilePath}`)
  Deno.exit(1)
}

// Step 1: rsync to server
log("Running rsync...")
const rsyncArgs = [
  "-avhzru",
  "-e",
  "ssh",
  ".",
  `${SSH_TO_SERVER}:${PATH_ON_SERVER}`,
  "--exclude-from=infra/deploy/exclude.txt",
]
const rsync = Deno.run({
  cmd: ["rsync", ...rsyncArgs],
  stdout: "inherit",
  stderr: "inherit",
})
const rsyncStatus = await rsync.status()
if (rsyncStatus.code !== 0) {
  error("rsync failed")
  Deno.exit(rsyncStatus.code)
}
success("rsync complete.")

// Step 2: Compose up on server
log("Running docker compose up on server...")
const composeCmd =
  `cd ${PATH_ON_SERVER} && cp ./infra/envs/.env.prod ./.env && docker compose up -d --build`

const ssh = Deno.run({
  cmd: ["ssh", SSH_TO_SERVER, composeCmd],
  stdout: "inherit",
  stderr: "inherit",
})
const sshStatus = await ssh.status()
if (sshStatus.code !== 0) {
  error("Remote compose failed")
  Deno.exit(sshStatus.code)
}

success("Deploy completed successfully.")
