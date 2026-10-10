# One image: Vite builds the SPA, `deno serve` runs the server and serves it. Port 8080.
ARG DENO_VERSION=2.9.7

FROM denoland/deno:${DENO_VERSION} AS build
WORKDIR /app
# The release pipeline passes the tag; the Settings screen shows it.
ARG APP_VERSION=development
ENV APP_VERSION=${APP_VERSION}
COPY . .
RUN deno install --frozen
RUN deno task build

FROM denoland/deno:${DENO_VERSION}
WORKDIR /app
# `deno cache` writes node_modules next to deno.jsonc, so /app belongs to the app user.
RUN chown deno:deno /app
# /data is the one folder the server writes at run time, and only with reminder notifications on
# (DATA_DIR=/data): the push subscriptions. Mount a volume there that the user the container runs
# as can write: `deno` (uid and gid 1993) unless another is set, as with `docker run --user`.
# Any user may write this folder, and a new named volume takes its owner and mode from it, so
# that works for every user; a folder mounted from the host keeps its own owner.
RUN mkdir /data && chown deno:deno /data && chmod 1777 /data
# The server's source and the dependencies it imports; the SPA is already built. Nothing else is
# written at run time, so the app runs as the base image's non-root `deno` user.
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
CMD ["deno", "serve", "--allow-net", "--allow-env", "--allow-read=apps/web/dist,/data", "--allow-write=/data", "--port", "8080", "apps/server/+main.ts"]
