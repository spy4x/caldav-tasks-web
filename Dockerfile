# One image: Vite builds the SPA, `deno serve` runs the server and serves it. Port 8080.
ARG DENO_VERSION=2.9.7

FROM denoland/deno:${DENO_VERSION} AS build
WORKDIR /app
COPY . .
RUN deno install --frozen
RUN deno task build

FROM denoland/deno:${DENO_VERSION}
WORKDIR /app
# `deno cache` writes node_modules next to deno.jsonc, so /app belongs to the app user.
RUN chown deno:deno /app
# The server's source and the dependencies it imports; the SPA is already built. Nothing in this
# image is written at run time, so the app runs as the base image's non-root `deno` user.
COPY --from=build --chown=deno:deno /app/deno.jsonc /app/deno.lock ./
COPY --from=build --chown=deno:deno /app/apps/server ./apps/server
COPY --from=build --chown=deno:deno /app/apps/web/deno.json ./apps/web/deno.json
COPY --from=build --chown=deno:deno /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=deno:deno /app/libs ./libs
USER deno
# Cache the server's dependencies now, so the container starts without reaching the registry.
RUN deno cache --frozen apps/server/+main.ts apps/server/healthcheck.ts
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["deno", "run", "--allow-net=127.0.0.1", "--allow-env", "apps/server/healthcheck.ts"]
CMD ["deno", "serve", "--allow-net", "--allow-env", "--allow-read=apps/web/dist", "--port", "8080", "apps/server/+main.ts"]
