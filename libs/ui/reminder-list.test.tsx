/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { ReminderList } from "./reminder-list.tsx"

Deno.test("reminders render as a labelled read-only list, one item each", () => {
  const html = renderToString(
    <ReminderList reminders={[{ trigger: "-PT1H" }, { trigger: "-P1D" }]} />,
  )
  expect(html).toMatch(/<section[^>]*aria-labelledby="task-reminders-heading"/)
  expect(html).toMatch(/<h2 id="task-reminders-heading"[^>]*>Reminders<\/h2>/)
  expect(html.match(/data-e2e="task-reminder"/g)).toHaveLength(2)
  expect(html).not.toMatch(/<(input|button|select|textarea)/)
})

Deno.test("no reminders render nothing", () => {
  expect(renderToString(<ReminderList reminders={[]} />)).toBe("")
})
