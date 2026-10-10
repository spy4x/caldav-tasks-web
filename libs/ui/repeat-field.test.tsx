/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useState } from "preact/hooks"
import { renderToString } from "preact-render-to-string"
import { RepeatField } from "./repeat-field.tsx"
import { mount, must } from "./mount.test.tsx"

interface Host {
  /** Every value the field reported, in order. */
  emitted: Array<string | null>
}

/** The field with the state a screen would hold for it, so a change comes back as the new value. */
function Controlled(
  { initial, host, timed, timeZone }: {
    initial: string | null
    host: Host
    timed?: boolean
    timeZone?: string
  },
) {
  const [value, setValue] = useState(initial)
  return (
    <RepeatField
      id="r"
      value={value}
      timed={timed}
      timeZone={timeZone}
      onChange={(next) => {
        host.emitted.push(next)
        setValue(next)
      }}
    />
  )
}

const input = (root: ParentNode, name: string) =>
  must<HTMLInputElement>(root, `[data-e2e="${name}"]`)
const last = (host: Host) => host.emitted.at(-1)

async function fire(
  act: (action: () => void) => Promise<void>,
  element: HTMLElement,
  type: string,
  set?: (element: HTMLElement) => void,
): Promise<void> {
  await act(() => {
    set?.(element)
    element.dispatchEvent(
      new (element.ownerDocument.defaultView!.Event as typeof Event)(type, { bubbles: true }),
    )
  })
}

type Act = (action: () => void) => Promise<void>

const choose = (act: Act, root: ParentNode, name: string, value: string) =>
  fire(act, input(root, name), `change`, (el) => ((el as HTMLSelectElement).value = value))
const typeInto = (act: Act, root: ParentNode, name: string, value: string) =>
  fire(act, input(root, name), `input`, (el) => ((el as HTMLInputElement).value = value))
const press = (act: Act, element: HTMLElement) => act(() => element.click())
const chip = (root: ParentNode, label: string) =>
  [...root.querySelectorAll(`[aria-label="Days of the week"] button`)].find((b) =>
    b.textContent === label
  ) as HTMLElement
const pressedDays = (root: ParentNode) =>
  [...root.querySelectorAll(`[aria-label="Days of the week"] button[aria-pressed="true"]`)].map((
    b,
  ) => b.textContent)

Deno.test("choosing weekly and then Monday and Thursday writes them as BYDAY", async () => {
  const host: Host = { emitted: [] }
  await mount(<Controlled initial={null} host={host} />, async ({ root, act }) => {
    await choose(act, root, `r-freq`, `2`)
    expect(last(host)).toBe(`FREQ=WEEKLY;INTERVAL=1`)
    await press(act, chip(root, `Thu`))
    await press(act, chip(root, `Mon`))
    // The days come out in week order, not in the order pressed.
    expect(last(host)).toBe(`FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH`)
    expect(pressedDays(root)).toEqual([`Mon`, `Thu`])
  })
})

Deno.test("the Weekdays button chooses Monday to Friday, and unpressing every day leaves a plain weekly rule", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=WEEKLY;INTERVAL=1" host={host} />,
    async ({ root, act }) => {
      await press(act, input(root, `r-weekdays`))
      expect(last(host)).toBe(`FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR`)
      for (const label of [`Mon`, `Tue`, `Wed`, `Thu`, `Fri`]) await press(act, chip(root, label))
      expect(last(host)).toBe(`FREQ=WEEKLY;INTERVAL=1`)
    },
  )
})

Deno.test("the day toggles exist only for a weekly rule, are buttons that say whether they are pressed", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=WEEKLY;INTERVAL=1;BYDAY=TU" host={host} />,
    async ({ root, act }) => {
      const buttons = [...root.querySelectorAll(`[aria-label="Days of the week"] button`)]
      expect(buttons.map((b) => b.textContent)).toEqual([
        `Mon`,
        `Tue`,
        `Wed`,
        `Thu`,
        `Fri`,
        `Sat`,
        `Sun`,
      ])
      expect(buttons.map((b) => b.getAttribute(`aria-pressed`))).toEqual([
        `false`,
        `true`,
        `false`,
        `false`,
        `false`,
        `false`,
        `false`,
      ])
      await choose(act, root, `r-freq`, `1`)
      expect(root.querySelector(`[aria-label="Days of the week"]`)).toBeNull()
      expect(last(host)).toBe(`FREQ=DAILY;INTERVAL=1`)
    },
  )
})

Deno.test("ending on a date writes UNTIL as a date, and a timed task as the end of that day in UTC", async () => {
  const dated: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=DAILY;INTERVAL=1" host={dated} />,
    async ({ root, act }) => {
      await choose(act, root, `r-end`, `date`)
      // Chosen but not filled in: not part of the rule yet.
      expect(dated.emitted).toEqual([])
      await typeInto(act, root, `r-until`, `2026-12-01`)
      expect(last(dated)).toBe(`FREQ=DAILY;UNTIL=20261201;INTERVAL=1`)
    },
  )

  const timed: Host = { emitted: [] }
  await mount(
    <Controlled
      initial="FREQ=DAILY;INTERVAL=1"
      host={timed}
      timed
      timeZone="Europe/Berlin"
    />,
    async ({ root, act }) => {
      await choose(act, root, `r-end`, `date`)
      await typeInto(act, root, `r-until`, `2026-12-01`)
      // 23:59:59 in Berlin (UTC+1 in December) is 22:59:59 UTC.
      expect(last(timed)).toBe(`FREQ=DAILY;UNTIL=20261201T225959Z;INTERVAL=1`)
      expect(input(root, `r-until`).value).toBe(`2026-12-01`)
    },
  )
})

Deno.test("ending after a number of times writes COUNT, and switching between the ends never writes both", async () => {
  const host: Host = { emitted: [] }
  await mount(<Controlled initial="FREQ=DAILY;INTERVAL=1" host={host} />, async ({ root, act }) => {
    await choose(act, root, `r-end`, `count`)
    await typeInto(act, root, `r-count`, `10`)
    expect(last(host)).toBe(`FREQ=DAILY;COUNT=10;INTERVAL=1`)

    await choose(act, root, `r-end`, `date`)
    expect(last(host)).toBe(`FREQ=DAILY;INTERVAL=1`)
    await typeInto(act, root, `r-until`, `2026-12-01`)
    expect(last(host)).toBe(`FREQ=DAILY;UNTIL=20261201;INTERVAL=1`)

    await choose(act, root, `r-end`, `count`)
    await typeInto(act, root, `r-count`, `3`)
    expect(last(host)).toBe(`FREQ=DAILY;COUNT=3;INTERVAL=1`)
    for (const value of host.emitted) {
      expect(value !== null && value.includes(`COUNT`) && value.includes(`UNTIL`)).toBe(false)
    }

    await choose(act, root, `r-end`, `never`)
    expect(last(host)).toBe(`FREQ=DAILY;INTERVAL=1`)
  })
})

Deno.test("a count that is not a whole number from 1 to 999 does not change the rule", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=DAILY;COUNT=5;INTERVAL=1" host={host} />,
    async ({ root, act }) => {
      for (const bad of [`0`, `1.5`, `1000`, `-2`]) await typeInto(act, root, `r-count`, bad)
      expect(host.emitted).toEqual([])
      await typeInto(act, root, `r-count`, `7`)
      expect(last(host)).toBe(`FREQ=DAILY;COUNT=7;INTERVAL=1`)
    },
  )
})

Deno.test("changing the interval or the days of a rule that ends keeps its end", async () => {
  for (
    const [initial, end] of [
      [`FREQ=WEEKLY;COUNT=10;INTERVAL=1;BYDAY=MO`, `COUNT=10`],
      [`FREQ=WEEKLY;UNTIL=20261201;INTERVAL=1;BYDAY=MO`, `UNTIL=20261201`],
    ]
  ) {
    const host: Host = { emitted: [] }
    await mount(<Controlled initial={initial} host={host} />, async ({ root, act }) => {
      await typeInto(act, root, `r-interval`, `2`)
      expect(last(host)).toContain(end)
      expect(last(host)).toContain(`INTERVAL=2`)
      await press(act, chip(root, `Thu`))
      expect(last(host)).toContain(end)
      expect(last(host)).toContain(`BYDAY=MO,TH`)
      // Another frequency keeps the end too; only the days go.
      await choose(act, root, `r-freq`, `3`)
      expect(last(host)).toContain(end)
      expect(last(host)).not.toContain(`BYDAY`)
    })
  }
})

Deno.test("a rule that ends, written by Tasks.org, opens in the controls and is written back unchanged by an edit that leaves its end alone", async () => {
  const written = `FREQ=WEEKLY;UNTIL=20261231T000000Z;INTERVAL=1;BYDAY=MO,TH`
  const host: Host = { emitted: [] }
  await mount(<Controlled initial={written} host={host} />, async ({ root, act }) => {
    expect(input(root, `r-freq`).value).toBe(`2`)
    expect(pressedDays(root)).toEqual([`Mon`, `Thu`])
    expect(input(root, `r-end`).value).toBe(`date`)
    expect(input(root, `r-until`).value).toBe(`2026-12-31`)
    // The original UNTIL, with its time and Z, survives an edit that is not about the end.
    await press(act, chip(root, `Tue`))
    expect(last(host)).toBe(`FREQ=WEEKLY;UNTIL=20261231T000000Z;INTERVAL=1;BYDAY=MO,TU,TH`)
  })

  const counted = renderToString(
    <RepeatField id="r" value="FREQ=DAILY;COUNT=5;INTERVAL=1" onChange={() => {}} />,
  )
  expect(counted).toMatch(/<option selected value="count"/)
  expect(counted).toMatch(/name="r-count"[^>]*value="5"/)
})

Deno.test("a rule with a month day, an ordinal, a daily weekday list or another week start stays Custom and is not offered the controls", async () => {
  for (
    const rule of [
      `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15`,
      `FREQ=MONTHLY;INTERVAL=1;BYDAY=2MO`,
      `FREQ=WEEKLY;INTERVAL=1;BYDAY=-1FR`,
      `FREQ=DAILY;INTERVAL=1;BYDAY=MO`,
      `FREQ=WEEKLY;WKST=SU;INTERVAL=1;BYDAY=MO`,
      `FREQ=YEARLY;INTERVAL=1;BYMONTH=3`,
    ]
  ) {
    const host: Host = { emitted: [] }
    await mount(<Controlled initial={rule} host={host} />, ({ root }) => {
      expect(input(root, `r-freq`).value).toBe(`custom`)
      expect(root.querySelector(`[data-e2e="r-end"]`)).toBeNull()
      expect(root.querySelector(`[aria-label="Days of the week"]`)).toBeNull()
      expect(host.emitted).toEqual([])
      return Promise.resolve()
    })
  }
})

Deno.test("Does not repeat clears the rule with its days and end", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=WEEKLY;COUNT=10;INTERVAL=1;BYDAY=MO,TH" host={host} />,
    async ({ root, act }) => {
      await choose(act, root, `r-freq`, `none`)
      expect(last(host)).toBeNull()
      expect(root.querySelector(`[data-e2e="r-end"]`)).toBeNull()
      // A new rule starts with no end, whatever the cleared one had.
      await choose(act, root, `r-freq`, `2`)
      expect(last(host)).toBe(`FREQ=WEEKLY;INTERVAL=1`)
      expect(input(root, `r-end`).value).toBe(`never`)
    },
  )
})

Deno.test("every control has a name and a disabled field disables them all", () => {
  const html = renderToString(
    <RepeatField
      id="r"
      value="FREQ=WEEKLY;COUNT=2;INTERVAL=1;BYDAY=MO"
      onChange={() => {}}
      disabled
    />,
  )
  for (const label of [`Repeat`, `Every \\(weeks\\)`, `Ends`, `Times`]) {
    expect(html).toMatch(new RegExp(`<label[^>]*for="r-[a-z]+"[^>]*>${label}`))
  }
  expect(html).toContain(`aria-label="Days of the week"`)
  const controls = html.match(/<(button|input|select)\b[^>]*>/g)!
  expect(controls.length).toBeGreaterThanOrEqual(12)
  for (const control of controls) expect(control).toContain(`disabled`)
})
