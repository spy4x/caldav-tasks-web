# Security Policy

Releases are container images tagged `v1.x.y` on Docker Hub (`antonshubin/caldav-tasks-web`). The
latest release is the supported version: a security fix ships as a new release, and older releases
get none. Settings shows the version you run.

## Reporting a vulnerability

**Do not open a public GitHub issue** for security findings.

Email **security@neatsoft.dev** (PGP key on request). Expect an acknowledgement within 72 hours.
Critical issues get a fix window of 14 days, high severity 30 days, medium 60 days. Please follow
responsible disclosure: no public write-up before a fix is available.

## Out of scope

- Vulnerabilities in the CalDAV server (Radicale, Stalwart, Nextcloud, Baikal): report those
  upstream.
- Vulnerabilities in Deno: report them to [denoland/deno](https://github.com/denoland/deno).
- Social engineering of the operator.
