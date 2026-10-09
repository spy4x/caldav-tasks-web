/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { dateOnly, dateTime, makeTask } from "./task-fixtures.ts"
import { mount, must } from "./mount.test.tsx"
import { TaskRow, type TaskRowProps } from "./task-row.tsx"
import { TaskStatus } from "../tasks/types.ts"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const base = (over: Partial<TaskRowProps> = {}): TaskRowProps => ({
  task: makeTask(`1`, `Buy oat milk`),
  zone: `UTC`,
  now: NOW,
  onComplete: () => {},
  onOpen: () => {},
  ...over,
})
const html = (over: Partial<TaskRowProps> = {}) =>
  renderToString(
    <ul>
      <TaskRow {...base(over)} />
    </ul>,
  )

Deno.test("the check is a real checkbox named Complete followed by the title", () => {
  const out = html()
  expect(out).toMatch(/<input[^>]*type="checkbox"/)
  expect(out).toContain(`aria-label="Complete Buy oat milk"`)
})

Deno.test("an open task is unchecked and a completed one is checked, struck through and faded", () => {
  const open = html()
  expect(open).not.toMatch(/<input[^>]*\schecked(?=[\s=/>])/)
  expect(open).not.toContain(`line-through`)
  const done = html({ task: makeTask(`1`, `Buy oat milk`, { status: TaskStatus.Completed }) })
  expect(done).toMatch(/<input[^>]*\schecked(?=[\s=/>])/)
  expect(done).toContain(`line-through`)
  expect(done).toMatch(/line-through opacity-60/)
})

Deno.test("a done task fades only its title, so the meta line keeps its contrast", () => {
  const done = html({
    task: makeTask(`1`, `Buy oat milk`, {
      status: TaskStatus.Completed,
      due: dateOnly(`2026-10-09`),
    }),
  })
  expect(done.match(/opacity-60/g)?.length).toBe(1)
  expect(done).toMatch(/<span class="break-words line-through opacity-60">/)
})

Deno.test("a completed task with a past due date is not coloured as overdue", () => {
  const done = html({
    task: makeTask(`1`, `A`, { status: TaskStatus.Completed, due: dateOnly(`2026-10-07`) }),
  })
  expect(done).toContain(`Yesterday`)
  expect(done).not.toContain(`text-danger`)
})

Deno.test("each row isolates its stacking, so its check cannot draw over a pinned bar", () => {
  expect(html()).toMatch(/<li class="isolate /)
})

Deno.test("the check completes the task and the title opens it, each without the other", async () => {
  const calls: string[] = []
  const task = makeTask(`1`, `Buy oat milk`)
  await mount(
    <ul>
      <TaskRow
        {...base({
          task,
          onComplete: (t, done) => calls.push(`complete ${t.uid} ${done}`),
          onOpen: (t) => calls.push(`open ${t.uid}`),
        })}
      />
    </ul>,
    async ({ root, act }) => {
      await act(() => must<HTMLInputElement>(root, `[data-e2e="task-check"]`).click())
      expect(calls).toEqual([`complete 1 true`])
      await act(() => must<HTMLButtonElement>(root, `[data-e2e="task-open"]`).click())
      expect(calls).toEqual([`complete 1 true`, `open 1`])
    },
  )
})

Deno.test("the meta line colours overdue and today's dates and says what a date-only value is", () => {
  const overdue = html({ task: makeTask(`1`, `A`, { due: dateOnly(`2026-10-07`) }) })
  expect(overdue).toMatch(/text-danger[^>]*>Yesterday</)
  const today = html({ task: makeTask(`1`, `A`, { due: dateTime(`2026-10-08`, `14:00:00`) }) })
  expect(today).toMatch(/text-accent-text[^>]*>Today 14:00</)
  const later = html({ task: makeTask(`1`, `A`, { due: dateOnly(`2026-10-15`) }) })
  expect(later).toMatch(/text-muted[^>]*>Thu 15 Oct</)
})

Deno.test("the meta line names the list, shows up to three tags and counts the rest", () => {
  const out = html({
    task: makeTask(`1`, `A`, { tags: [`one`, `two`, `three`, `four`, `five`] }),
    list: { name: `Errands`, color: `#6aa84f` },
  })
  expect(out).toContain(`Errands`)
  expect(out).toContain(`#6aa84f`)
  expect(out).toContain(`#one`)
  expect(out).toContain(`#three`)
  expect(out).not.toContain(`#four`)
  expect(out).toContain(`+2`)
})

Deno.test("priority, repeat and reminder marks carry a text name for screen readers", () => {
  const out = html({
    task: makeTask(`1`, `A`, {
      priority: 1,
      repeatRule: `FREQ=WEEKLY`,
      reminders: [{ trigger: `-PT15M` }],
    }),
  })
  expect(out).toContain(`High priority`)
  expect(out).toContain(`Repeats`)
  expect(out).toContain(`Has a reminder`)
  const plain = html()
  expect(plain).not.toContain(`High priority`)
  expect(plain).not.toContain(`Repeats`)
  expect(plain).not.toContain(`Has a reminder`)
})

Deno.test("a row with subtasks has an expander that says what it does and reports a press", async () => {
  const calls: boolean[] = []
  const props = base({
    subtaskCount: 3,
    expanded: true,
    onExpandedChange: (_task, expanded) => calls.push(expanded),
  })
  await mount(
    <ul>
      <TaskRow {...props} />
    </ul>,
    async ({ root, act, rerender }) => {
      const expander = must<HTMLButtonElement>(root, `[data-e2e="task-expand"]`)
      expect(expander.getAttribute(`aria-expanded`)).toBe(`true`)
      expect(expander.getAttribute(`aria-label`)).toBe(`Hide 3 subtasks of Buy oat milk`)
      await act(() => expander.click())
      expect(calls).toEqual([false])
      await rerender(
        <ul>
          <TaskRow {...props} expanded={false} subtaskCount={1} />
        </ul>,
      )
      expect(expander.getAttribute(`aria-label`)).toBe(`Show 1 subtask of Buy oat milk`)
    },
  )
})

Deno.test("Right Arrow opens the subtasks and Left Arrow closes them", async () => {
  const calls: boolean[] = []
  const props = base({
    subtaskCount: 2,
    expanded: false,
    onExpandedChange: (_task, expanded) => calls.push(expanded),
  })
  await mount(
    <ul>
      <TaskRow {...props} />
    </ul>,
    async ({ root, window, act, rerender }) => {
      const title = must<HTMLButtonElement>(root, `[data-e2e="task-open"]`)
      const press = (key: string) =>
        act(() => {
          title.dispatchEvent(new window.KeyboardEvent(`keydown`, { key, bubbles: true }) as never)
        })
      await press(`ArrowLeft`)
      expect(calls).toEqual([])
      await press(`ArrowRight`)
      expect(calls).toEqual([true])
      await rerender(
        <ul>
          <TaskRow {...props} expanded />
        </ul>,
      )
      await press(`ArrowRight`)
      expect(calls).toEqual([true])
      await press(`ArrowLeft`)
      expect(calls).toEqual([true, false])
    },
  )
})

Deno.test("a row without subtasks has no expander and ignores the arrow keys", async () => {
  const calls: boolean[] = []
  await mount(
    <ul>
      <TaskRow {...base({ onExpandedChange: (_t, expanded) => calls.push(expanded) })} />
    </ul>,
    async ({ root, window, act }) => {
      expect(root.querySelector(`[data-e2e="task-expand"]`)).toBeNull()
      const title = must<HTMLButtonElement>(root, `[data-e2e="task-open"]`)
      await act(() => {
        title.dispatchEvent(
          new window.KeyboardEvent(`keydown`, { key: `ArrowRight`, bubbles: true }) as never,
        )
      })
      expect(calls).toEqual([])
    },
  )
})
