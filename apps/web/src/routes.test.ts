/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  findListBySlug,
  gateRedirect,
  listPath,
  listSettingsPath,
  nextPath,
  signInPath,
  taskPath,
} from "./routes.ts"
import { SessionStatus } from "./state/session.ts"

Deno.test(`a signed-out visit to a page goes to Sign in and remembers the page and its filters`, () => {
  expect(gateRedirect(SessionStatus.SignedOut, `/lists/errands`, `sort=due&tags=home`)).toBe(
    `/sign-in?next=${encodeURIComponent(`/lists/errands?sort=due&tags=home`)}`,
  )
})

Deno.test(`a signed-out visit to Today goes to a plain Sign in`, () => {
  expect(gateRedirect(SessionStatus.SignedOut, `/`, ``)).toBe(`/sign-in`)
})

Deno.test(`a signed-out person already on Sign in stays there`, () => {
  expect(gateRedirect(SessionStatus.SignedOut, `/sign-in`, `next=%2Fsearch`)).toBeNull()
})

Deno.test(`nothing moves before the server has answered`, () => {
  expect(gateRedirect(SessionStatus.Unknown, `/lists`, ``)).toBeNull()
})

Deno.test(`signing in sends the person back to where they were going`, () => {
  const away = signInPath(`/tasks/abc?x=1`)
  const search = away.slice(away.indexOf(`?`))
  expect(gateRedirect(SessionStatus.SignedIn, `/sign-in`, search)).toBe(`/tasks/abc?x=1`)
})

Deno.test(`signing in without a remembered page opens Today`, () => {
  expect(gateRedirect(SessionStatus.SignedIn, `/sign-in`, ``)).toBe(`/`)
})

Deno.test(`a signed-in person on an ordinary page stays there`, () => {
  expect(gateRedirect(SessionStatus.SignedIn, `/upcoming`, ``)).toBeNull()
})

Deno.test(`a next address that leaves the site is ignored`, () => {
  for (
    const next of [`https://evil.example/`, `//evil.example/`, `/\\evil.example`, `javascript:1`]
  ) {
    expect(nextPath(`next=${encodeURIComponent(next)}`)).toBe(`/`)
  }
})

Deno.test(`a next address disguised with a tab, a newline, an escape or a backslash never leaves the site`, () => {
  const disguised = [
    `/\t/evil.example`,
    `/\n/evil.example`,
    `/\r/evil.example`,
    `\t//evil.example`,
    `/%09/evil.example`,
    `/\\evil.example`,
    `\\\\evil.example`,
    `/\\/evil.example`,
  ]
  for (const next of disguised) {
    const result = nextPath(`next=${encodeURIComponent(next)}`)
    expect(new URL(result, `http://app.invalid`).origin).toBe(`http://app.invalid`)
    expect(result.startsWith(`//`)).toBe(false)
  }
  expect(nextPath(`next=${encodeURIComponent(`/\t/evil.example`)}`)).toBe(`/`)
})

Deno.test(`a signed-out visit never remembers an address that leaves the site`, () => {
  expect(signInPath(`/\t/evil.example`)).toBe(`/sign-in`)
  expect(signInPath(`//evil.example/x`)).toBe(`/sign-in`)
})

Deno.test(`a next address that is Sign in itself opens Today`, () => {
  expect(nextPath(`next=%2Fsign-in%3Fnext%3D%2Fsearch`)).toBe(`/`)
})

Deno.test(`a list address names the list by the last part of its server path`, () => {
  const lists = [{ href: `/dav/e2e/errands/` }, { href: `/dav/e2e/work/` }]
  expect(listPath(lists[1])).toBe(`/lists/work`)
  expect(findListBySlug(lists, `work`)).toBe(lists[1])
  expect(findListBySlug(lists, `nope`)).toBeUndefined()
})

Deno.test(`a task address survives a UID with characters that need escaping`, () => {
  expect(taskPath({ uid: `a b/c` })).toBe(`/tasks/a%20b%2Fc`)
})

Deno.test(`a list's settings live under its own address, which the router reads back to the list`, () => {
  const href = `/dav/user/work%20%2F%20home/`
  const path = listSettingsPath(href)
  expect(path).toBe(`${listPath(href)}/settings`)
  const slug = decodeURIComponent(path.split(`/`)[2])
  expect(findListBySlug([{ href }], slug)?.href).toBe(href)
})
