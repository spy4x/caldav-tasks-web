/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { AlarmRelated, AlarmTriggerKind } from "@spy4x/time/ical-tasks"
import { ReminderList } from "./reminder-list.tsx"
import { reminder } from "./task-fixtures.ts"

Deno.test("reminders render as a labelled read-only list, one item each", () => {
  const html = renderToString(
    <ReminderList reminders={[reminder("-PT1H"), reminder("-P1D")]} />,
  )
  expect(html).toMatch(/<section[^>]*aria-labelledby="task-reminders-heading"/)
  expect(html).toMatch(/<h2 id="task-reminders-heading"[^>]*>Reminders<\/h2>/)
  expect(html.match(/data-e2e="task-reminder"/g)).toHaveLength(2)
  expect(html).not.toMatch(/<(input|button|select|textarea)/)
})

Deno.test("no reminders render nothing", () => {
  expect(renderToString(<ReminderList reminders={[]} />)).toBe("")
})

Deno.test("a reminder counted from the end reads as before due, one from the start as before start", () => {
  const html = renderToString(
    <ReminderList reminders={[reminder("-PT15M", AlarmRelated.End), reminder("-PT15M")]} />,
  )
  expect(html).toContain("15 minutes before due")
  expect(html).toContain("15 minutes before start")
})

Deno.test("a trigger the library cannot describe is shown as written", () => {
  const html = renderToString(
    <ReminderList
      reminders={[{
        trigger: "-P1M",
        alarm: { kind: AlarmTriggerKind.Relative, duration: "-P1M", related: AlarmRelated.Start },
      }]}
    />,
  )
  expect(html).toContain("<code>-P1M</code>")
})
