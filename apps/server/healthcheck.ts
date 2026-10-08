import { runHealthcheck } from "@spy4x/server/healthcheck"

// The container's HEALTHCHECK: opens a connection to the server's port on loopback and exits 0
// when it connects, 1 otherwise. The port matches `--port` in the Dockerfile.
await runHealthcheck({ port: 8080 })
