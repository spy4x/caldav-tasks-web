FROM denoland/deno:debian-2.2.0

# Install SQLite shared library for @db/sqlite FFI
RUN apt-get update -qq && apt-get install -y -qq libsqlite3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps first
COPY deno.json deno.lock* ./
COPY libs/ libs/
RUN deno cache apps/api/index.ts

# Copy everything (web dist is built before deploy)
COPY . .

# Remove source maps and dev files
RUN rm -rf apps/web/src apps/web/vite.config.ts

EXPOSE 8080

# Run migrations, then start API
CMD ["sh", "-c", "deno run -A libs/server/db/migrate.ts && deno run -A apps/api/index.ts"]
