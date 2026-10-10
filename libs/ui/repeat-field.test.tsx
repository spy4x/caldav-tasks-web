/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { useState } from "preact/hooks"
import { renderToString } from "preact-render-to-string"
import { IcalDateKind, type IcalDateValue } from "@spy4x/time/ical"
import { nextOccurrence, parseRrule } from "@spy4x/time/rrule"
import { type RepeatAnchor, repeatAnchor, RepeatField } from "./repeat-field.tsx"
import { mount, must } from "./mount.test.tsx"

interface Host {
  /** Every value the field reported, in order. */
  emitted: Array<string | null>
}

/** The field with the state a screen would hold for it, so a change comes back as the new value. */
function Controlled(
  { initial, host, anchor }: {
    initial: string | null
    host: Host
    anchor?: RepeatAnchor
  },
) {
  const [value, setValue] = useState(initial)
  return (
    <RepeatField
      id="r"
      value={value}
      anchor={anchor}
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
      expect(root.querySelector(`[aria-label="Days of the week"]`) === null).toBe(true)
      expect(last(host)).toBe(`FREQ=DAILY;INTERVAL=1`)
    },
  )
})

/** Where the task goes next when it is completed on `due`, the way the app's completion does it. */
function nextAfter(rule: string, due: IcalDateValue): IcalDateValue | null {
  const parsed = parseRrule(rule)
  if (!parsed.success) throw new Error(parsed.error.message)
  // A date and a floating time are read as UTC, as the app's completion does.
  const instant = new Date(`${due.date}T${due.time ?? `00:00:00`}Z`)
  const next = nextOccurrence(parsed.output, { after: instant, start: due })
  if (!next.success) throw new Error(next.error.message)
  return next.output
}

const floating = (date: string, time: string): IcalDateValue => ({
  kind: IcalDateKind.Floating,
  date,
  time,
})

Deno.test("ending on a date writes UNTIL as a date for a date, and the day is the chosen one when the task is completed", async () => {
  const host: Host = { emitted: [] }
  await mount(<Controlled initial="FREQ=DAILY;INTERVAL=1" host={host} />, async ({ root, act }) => {
    await choose(act, root, `r-end`, `date`)
    // Chosen but not filled in: not part of the rule yet.
    expect(host.emitted).toEqual([])
    await typeInto(act, root, `r-until`, `2026-12-01`)
    expect(last(host)).toBe(`FREQ=DAILY;UNTIL=20261201;INTERVAL=1`)
    const dated = { kind: IcalDateKind.Date, date: `2026-11-30` }
    expect(nextAfter(last(host)!, dated)?.date).toBe(`2026-12-01`)
    expect(nextAfter(last(host)!, { ...dated, date: `2026-12-01` })).toBeNull()
  })
})

Deno.test("a floating time is ended with a floating UNTIL, so the last day is the chosen one in any zone", async () => {
  // In Los Angeles the evening of 1 January is already 2 January in UTC; in Tokyo the morning is
  // still 31 December in UTC. A floating end must not care.
  for (
    const [zone, time] of [
      [`America/Los_Angeles`, `20:00:00`],
      [`America/Los_Angeles`, `07:00:00`],
      [`Asia/Tokyo`, `06:00:00`],
      [`Asia/Tokyo`, `18:00:00`],
      [`Europe/Berlin`, `23:30:00`],
    ]
  ) {
    const host: Host = { emitted: [] }
    const anchor = { kind: IcalDateKind.Floating, timeZone: zone }
    await mount(
      <Controlled initial="FREQ=DAILY;INTERVAL=1" host={host} anchor={anchor} />,
      async ({ root, act }) => {
        await choose(act, root, `r-end`, `date`)
        await typeInto(act, root, `r-until`, `2020-01-01`)
        const rule = last(host)!
        expect(rule).toBe(`FREQ=DAILY;UNTIL=20200101T235959;INTERVAL=1`)
        expect(nextAfter(rule, floating(`2019-12-31`, time))?.date).toBe(`2020-01-01`)
        expect(nextAfter(rule, floating(`2020-01-01`, time))).toBeNull()
        expect(input(root, `r-until`).value).toBe(`2020-01-01`)
        expect(must(root, `[data-e2e="task-repeat-label"]`).textContent).toContain(
          `until 2020-01-01`,
        )
      },
    )
  }
})

Deno.test("a UTC or zoned time is ended at the end of the chosen day in its zone, as UTC", async () => {
  for (
    const [kind, zone, expected] of [
      [IcalDateKind.Utc, `America/Los_Angeles`, `20200102T075959Z`],
      [IcalDateKind.Utc, `Asia/Tokyo`, `20200101T145959Z`],
      [IcalDateKind.Zoned, `Europe/Berlin`, `20200101T225959Z`],
    ] as const
  ) {
    const host: Host = { emitted: [] }
    await mount(
      <Controlled
        initial="FREQ=DAILY;INTERVAL=1"
        host={host}
        anchor={{ kind, timeZone: zone }}
      />,
      async ({ root, act }) => {
        await choose(act, root, `r-end`, `date`)
        await typeInto(act, root, `r-until`, `2020-01-01`)
        expect(last(host)).toBe(`FREQ=DAILY;UNTIL=${expected};INTERVAL=1`)
        // What the person typed comes back out of the rule they just wrote.
        expect(input(root, `r-until`).value).toBe(`2020-01-01`)
      },
    )
  }
})

Deno.test("the summary and the end date field name the same day for a UTC end in a zone west of UTC", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled
      initial="FREQ=WEEKLY;UNTIL=20261231T000000Z;INTERVAL=1"
      host={host}
      anchor={{ kind: IcalDateKind.Utc, timeZone: `America/New_York` }}
    />,
    ({ root }) => {
      expect(input(root, `r-until`).value).toBe(`2026-12-30`)
      expect(must(root, `[data-e2e="task-repeat-label"]`).textContent).toBe(
        `Weekly, until 2026-12-30`,
      )
      return Promise.resolve()
    },
  )
})

Deno.test("the anchor follows the time the editor shows: a date without one, a floating time when one is new, the old kind and zone otherwise", () => {
  const zoned = {
    kind: IcalDateKind.Zoned,
    date: `2026-10-12`,
    time: `09:00:00`,
    tzid: `Asia/Tokyo`,
  }
  const utc = { kind: IcalDateKind.Utc, date: `2026-10-12`, time: `09:00:00` }
  const date = { kind: IcalDateKind.Date, date: `2026-10-12` }
  const zone = `America/Los_Angeles`
  expect(repeatAnchor(``, zoned, zone)).toEqual({ kind: IcalDateKind.Date, timeZone: zone })
  expect(repeatAnchor(`07:00`, undefined, zone)).toEqual({
    kind: IcalDateKind.Floating,
    timeZone: zone,
  })
  expect(repeatAnchor(`07:00`, date, zone)).toEqual({ kind: IcalDateKind.Floating, timeZone: zone })
  expect(repeatAnchor(`07:00`, utc, zone)).toEqual({ kind: IcalDateKind.Utc, timeZone: zone })
  expect(repeatAnchor(`07:00`, zoned, zone)).toEqual({
    kind: IcalDateKind.Zoned,
    timeZone: `Asia/Tokyo`,
  })
})

Deno.test("an end that is chosen but not filled in stops the save, and the Ends choice follows a rule that changes from outside", async () => {
  const host: Host = { emitted: [] }
  await mount(
    <Controlled initial="FREQ=DAILY;INTERVAL=1" host={host} />,
    async ({ root, act, rerender }) => {
      await choose(act, root, `r-end`, `date`)
      expect(input(root, `r-until`).required).toBe(true)
      await choose(act, root, `r-end`, `count`)
      expect(input(root, `r-count`).required).toBe(true)
      // Another rule arrives, with no end: the pending choice does not outlive it.
      await rerender(<RepeatField id="r" value="FREQ=WEEKLY;INTERVAL=3" onChange={() => {}} />)
      expect(input(root, `r-end`).value).toBe(`never`)
      await rerender(
        <RepeatField id="r" value="FREQ=WEEKLY;COUNT=4;INTERVAL=3" onChange={() => {}} />,
      )
      expect(input(root, `r-end`).value).toBe(`count`)
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
      expect(root.querySelector(`[data-e2e="r-end"]`) === null).toBe(true)
      expect(root.querySelector(`[aria-label="Days of the week"]`) === null).toBe(true)
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
      expect(root.querySelector(`[data-e2e="r-end"]`) === null).toBe(true)
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
  // The class list carries `disabled:` variants, so look for the attribute itself.
  for (const control of controls) expect(control).toMatch(/\sdisabled(?:=|\s|>)/)
})
