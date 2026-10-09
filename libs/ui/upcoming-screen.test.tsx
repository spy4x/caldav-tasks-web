/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { renderToString } from "preact-render-to-string"
import { mount, must, texts } from "./mount.test.tsx"
import { dateOnly, makeTask } from "./task-fixtures.ts"
import { UpcomingScreen, type UpcomingScreenProps } from "./upcoming-screen.tsx"

const NOW = new Date(`2026-10-08T09:00:00Z`)
const props = (over: Partial<UpcomingScreenProps> = {}): UpcomingScreenProps => ({
  days: [
    { date: `2026-10-09`, tasks: [makeTask(`a`, `Dentist`, { due: dateOnly(`2026-10-09`) })] },
    {
      date: `2026-10-15`,
      tasks: [
        makeTask(`b`, `Plan the hike`, { due: dateOnly(`2026-10-15`) }),
        makeTask(`c`, `Pack`, { due: dateOnly(`2026-10-15`) }),
      ],
    },
  ],
  lists: [{ href: `/dav/tasks/home/`, name: `Home`, openCount: 3 }],
  zone: `UTC`,
  now: NOW,
  onComplete: () => {},
  onOpen: () => {},
  ...over,
})

Deno.test("each day with tasks has a heading, Tomorrow or weekday and date, with its tasks under it", async () => {
  await mount(<UpcomingScreen {...props()} />, async ({ root }) => {
    expect(texts(root, `h2`)).toEqual([`Tomorrow`, `Thu 15 Oct`])
    const sections = [...root.querySelectorAll(`section`)]
    expect(sections.map((s) => texts(s, `[data-e2e="task-open"]`))).toEqual([
      [`Dentist`],
      [`Plan the hike`, `Pack`],
    ])
  })
})

Deno.test("a day's task list is named after its heading for screen readers", () => {
  const html = renderToString(<UpcomingScreen {...props()} />)
  expect(html).toContain(`aria-label="Thu 15 Oct"`)
  expect(html).toContain(`aria-labelledby="upcoming-2026-10-15"`)
})

Deno.test("with no tasks in the next days it says Nothing coming up", () => {
  const html = renderToString(<UpcomingScreen {...props({ days: [] })} />)
  expect(html).toContain(`Nothing coming up`)
  expect(html).toContain(`next 14 days`)
})

Deno.test("while loading the screen shows a skeleton, not the empty state", () => {
  const html = renderToString(<UpcomingScreen {...props({ days: [], loading: true })} />)
  expect(html).toContain(`aria-busy="true"`)
  expect(html).not.toContain(`Nothing coming up`)
})

Deno.test("pressing a row's title opens that task", async () => {
  const opened: string[] = []
  await mount(
    <UpcomingScreen {...props({ onOpen: (task) => opened.push(task.uid) })} />,
    async ({ root, act }) => {
      await act(() =>
        must<HTMLButtonElement>(root, `[data-task-uid="c"] [data-e2e="task-open"]`).click()
      )
      expect(opened).toEqual([`c`])
    },
  )
})
