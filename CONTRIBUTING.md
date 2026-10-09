# Contributing

Bug reports and pull requests are welcome. For security findings, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development

```bash
deno install --frozen    # exact dependency versions from deno.lock
deno task check          # lint, format, type check, tests; run before every push
deno task build          # builds apps/web into apps/web/dist
deno task radicale:up    # Radicale for development and e2e
deno task e2e            # Playwright against the built app and Radicale
```

CI runs the same `check`, then the build and the e2e tests (`.woodpecker/ci.yml`).

## Layout

| Path          | What it holds                                      |
| ------------- | -------------------------------------------------- |
| `apps/server` | Hono server: `/health`, `/api`, the built web app  |
| `apps/web`    | Preact web app (Vite)                              |
| `libs/api`    | The JSON contract between server and web app       |
| `libs/tasks`  | The app's task identity, wording and test fixtures |
| `libs/ui`     | Screens: props in, callbacks out, no app imports   |
| `e2e`         | Playwright tests; fixtures seed Radicale           |
| `tests`       | Guard tests over the UI rules                      |
| `infra`       | Radicale for development                           |
