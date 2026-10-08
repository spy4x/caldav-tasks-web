import { secureHeaders } from "hono/secure-headers"
import type { MiddlewareHandler } from "hono"

/** The base64 SHA-256 CSP source of each inline `<script>` or `<style>` block in `html`. */
export async function inlineBlockHashes(
  html: string,
  tag: "script" | "style",
): Promise<string[]> {
  const hashes: string[] = []
  for (const match of html.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, `g`))) {
    const attributes = match[1] ?? ``
    const body = match[2]
    if (/\ssrc=/.test(attributes) || body === ``) continue
    const digest = await crypto.subtle.digest(`SHA-256`, new TextEncoder().encode(body))
    hashes.push(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`)
  }
  return hashes
}

/**
 * Security headers for every response. The Vite build puts one inline script (the theme
 * bootstrap) and one inline style in `index.html`; their hashes are read from the built page, so
 * the policy allows exactly those and no `unsafe-inline`.
 */
export async function securityHeaders(shellHtml: string): Promise<MiddlewareHandler> {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: [`'self'`],
      scriptSrc: [`'self'`, ...await inlineBlockHashes(shellHtml, `script`)],
      styleSrc: [`'self'`, ...await inlineBlockHashes(shellHtml, `style`)],
      imgSrc: [`'self'`, `data:`],
      connectSrc: [`'self'`],
      objectSrc: [`'none'`],
      baseUri: [`'self'`],
      formAction: [`'self'`],
      frameAncestors: [`'none'`],
    },
    xFrameOptions: `DENY`,
    referrerPolicy: `no-referrer`,
    xContentTypeOptions: `nosniff`,
  })
}
