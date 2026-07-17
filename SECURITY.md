# Security Policy

## Supported Versions

| Version | Supported         |
| ------- | ----------------- |
| `main`  | yes               |
| tags    | latest minor only |

This is a self-hosted single-binary application with no formal release
cadence — `main` is the supported branch. Pull the latest image, build
from source, or `git pull`. Security fixes land on `main` first and are
cherry-picked into the next deployed tag.

## Reporting a Vulnerability

**Do not open a public GitHub issue** for security-relevant findings.

Email: **security@neatsoft.dev** (PGP key on request).
Expect an acknowledgement within 72 hours. Critical issues get a fix
window of 14 days; high severity 30 days; medium 60 days.

If you find a credential leak, hardcoded secret, or remote code
execution path, please follow responsible disclosure — don't write it
up in a public blog before a fix is available.

## Threat Model

The application assumes:

- The host running the API is trusted (it's your server).
- HTTPS is terminated upstream (Traefik, Caddy, nginx) — the session
  cookie sets `Secure` by default.
- The CalDAV server credentials stored in the SQLite database are
  encrypted with AES-GCM keyed by `ENCRYPTION_SECRET` from the
  environment.
- PBKDF2 with a pepper (`AUTH_PEPPER`) protects user passwords.

The application does **not** assume:

- The browser is trusted beyond the same-origin policy.
- The local filesystem is hardened against the user running the API.
- Side-channel resistance (cache timing, etc.) — Deno's standard
  library is trusted but not audited at the level of an OpenSSL release.

Out of scope:

- Vulnerabilities in the CalDAV server (Radicale, Stalwart, Nextcloud,
  Baikal) — report those upstream.
- Vulnerabilities in Deno itself — report to [denoland/deno](https://github.com/denoland/deno).
- Social engineering of the operator.

## Cryptographic Choices

| Purpose          | Algorithm                  | Notes                               |
| ---------------- | -------------------------- | ----------------------------------- |
| Password hashing | PBKDF2-SHA-256 (100k iter) | pepper from `AUTH_PEPPER`           |
| Session cookie   | Random 32-byte token       | stored in SQLite, HttpOnly + Secure |
| Cookie signing   | HMAC-SHA-256               | key from `AUTH_COOKIE_SECRET`       |
| CalDAV creds     | AES-256-GCM                | key from `ENCRYPTION_SECRET`        |
| TLS              | System / upstream proxy    | not implemented in the API itself   |

If you fork this project for production, generate fresh secrets —
**do not commit your `.env.prod`**.

## Hardening Checklist

- [ ] Terminate TLS in front of the API (Traefik, Caddy, nginx).
- [ ] Generate `AUTH_PEPPER`, `AUTH_COOKIE_SECRET`, `ENCRYPTION_SECRET`
      with `openssl rand -base64 48` or `deno eval 'crypto.subtle'`.
- [ ] Set `CORS_ORIGIN` to the exact frontend URL — not `*`.
- [ ] Restrict the SQLite file at the filesystem level (`chmod 600`,
      dedicated non-root user).
- [ ] Enable fail2ban or equivalent on the CalDAV upstream — this app
      does not rate-limit CalDAV login failures.
- [ ] Run the container as a non-root user (the provided Dockerfile
      does this).
- [ ] Back up `data/todoapp.db` regularly. Restoring requires the
      same `ENCRYPTION_SECRET` — losing it means re-entering all CalDAV
      credentials.

## Historical Incidents

None disclosed publicly. The repository started in 2026 with the
first public release; no prior security-relevant history.
