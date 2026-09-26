# Contributing

Bug reports and pull requests are welcome. For security findings, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development

```bash
deno task check                                 # fmt + lint + typecheck
deno test apps/api/services/caldav/parse.test.ts
```

The CalDAV parser tests cover Radicale (default namespace), lowercase
`d:` prefixes, and Stalwart (uppercase `D:` / `A:`). Adding a Nextcloud
or Baikal adapter is a new class in `apps/api/services/caldav/` and a
case in `getAdapter()` — the route layer stays untouched.

How the code is organised: [docs/architecture.md](docs/architecture.md).
