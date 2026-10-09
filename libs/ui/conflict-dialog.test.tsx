/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { ConflictDialog } from "./conflict-dialog.tsx"

Deno.test("a closed conflict dialog renders nothing", () => {
  const html = renderToString(
    <ConflictDialog open={false} onKeepMine={() => {}} onUseTheirs={() => {}} />,
  )
  expect(html).toBe("")
})

Deno.test("the open dialog is an alert dialog titled Changed on another device with both choices", () => {
  const html = renderToString(<ConflictDialog open onKeepMine={() => {}} onUseTheirs={() => {}} />)
  expect(html).toContain(`role="alertdialog"`)
  expect(html).toContain("Changed on another device")
  expect(html).toMatch(/<button[^>]*>Keep mine<\/button>|Keep mine/)
  expect(html).toContain("Use theirs")
})

Deno.test("while busy both choices are disabled", () => {
  const html = renderToString(
    <ConflictDialog open busy onKeepMine={() => {}} onUseTheirs={() => {}} />,
  )
  for (const name of ["task-conflict-use-theirs", "task-conflict-keep-mine"]) {
    expect(html).toMatch(new RegExp(`<button[^>]*data-e2e="${name}"[^>]*>`))
    expect(html.match(new RegExp(`<button[^>]*data-e2e="${name}"[^>]*>`))![0]).toMatch(
      /\sdisabled[\s>/=]/,
    )
  }
})

Deno.test("the focus starts on Use theirs, the choice that loses nothing the server holds", () => {
  const html = renderToString(<ConflictDialog open onKeepMine={() => {}} onUseTheirs={() => {}} />)
  expect(html).toMatch(/<button[^>]*autofocus[^>]*data-e2e="task-conflict-use-theirs"/)
  expect(html).not.toMatch(/<button[^>]*autofocus[^>]*data-e2e="task-conflict-keep-mine"/)
})
