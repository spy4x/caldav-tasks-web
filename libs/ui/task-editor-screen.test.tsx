/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { renderToString } from "preact-render-to-string"
import { AlarmRelated, AlarmTriggerKind } from "@spy4x/time/ical-tasks"
import { IcalDateKind, PriorityBand, type Task, type TaskList, TaskStatus } from "@tasks/types.ts"
import {
  type TaskDraft,
  TaskEditorScreen,
  type TaskEditorScreenProps,
} from "./task-editor-screen.tsx"
import { reminder } from "./task-fixtures.ts"

const LISTS: TaskList[] = [
  { href: "/cal/home/", name: "Home", openCount: 3 },
  { href: "/cal/work/", name: "Work", openCount: 5 },
]

/** An invented task: due on a zoned time with seconds, a priority of 3 and two tags. */
function task(patch: Partial<Task> = {}): Task {
  return {
    uid: "uid-1",
    href: "/cal/home/uid-1.ics",
    etag: `"v1"`,
    ics: "",
    listHref: "/cal/home/",
    title: "Water the plants",
    notes: "Ferns need less.",
    status: TaskStatus.NeedsAction,
    priority: 3,
    due: { kind: IcalDateKind.Zoned, date: "2026-10-12", time: "09:30:15", tzid: "Europe/Berlin" },
    tags: ["home", "garden"],
    reminders: [],
    ...patch,
  }
}

function props(patch: Partial<TaskEditorScreenProps> = {}): TaskEditorScreenProps {
  return { task: task(), lists: LISTS, onSave: () => {}, navigate: () => {}, ...patch }
}

/** Renders the screen into a fresh DOM and hands the test a way to re-render it with new props. */
async function mount(
  test: (
    root: HTMLElement,
    window: Window,
    rerender: (next: TaskEditorScreenProps) => Promise<void>,
  ) => Promise<void>,
  initial: TaskEditorScreenProps,
): Promise<void> {
  const window = new Window({ url: "http://app.localhost/tasks/uid-1" })
  const own = {
    document: globalThis.document,
    HTMLAnchorElement: globalThis.HTMLAnchorElement,
    Element: globalThis.Element,
    FormData: globalThis.FormData,
  }
  Object.assign(globalThis, {
    // `EnhancedForm` reads `new FormData(form)`, which Deno's own class refuses for a happy-dom form.
    FormData: window.FormData,
    document: window.document,
    HTMLAnchorElement: window.HTMLAnchorElement,
    Element: window.Element,
  })
  // `UnsavedGuard` reads the page's address from the `location` global, which Deno does not have.
  const ownLocation = Object.getOwnPropertyDescriptor(globalThis, "location")
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true })
  const root = window.document.createElement("div") as unknown as HTMLElement
  window.document.body.append(root as never)
  const rerender = (next: TaskEditorScreenProps) =>
    act(() => render(<TaskEditorScreen {...next} />, root))
  try {
    await rerender(initial)
    await test(root, window, rerender)
  } finally {
    await act(() => render(null, root))
    Object.assign(globalThis, own)
    if (ownLocation) Object.defineProperty(globalThis, "location", ownLocation)
    else Reflect.deleteProperty(globalThis, "location")
    await window.happyDOM.close()
  }
}

const e2e = (root: ParentNode, name: string) =>
  root.querySelector(`[data-e2e="${name}"]`) as HTMLElement

/** Types into an input the way a person does: sets the value, then fires `input`. */
async function type(root: ParentNode, name: string, value: string): Promise<void> {
  const input = e2e(root, name) as HTMLInputElement
  await act(() => {
    input.value = value
    input.dispatchEvent(
      new (input.ownerDocument.defaultView!.Event as typeof Event)("input", { bubbles: true }),
    )
  })
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    // `EnhancedForm` calls `onSubmit` one microtask after the submit event.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

Deno.test("every field has a visible label tied to its control", () => {
  const html = renderToString(<TaskEditorScreen {...props()} />)
  for (
    const [id, text] of [
      ["task-title", "Title"],
      ["task-notes", "Notes"],
      ["task-due-date", "Due date"],
      ["task-due-time", "Due time \\(optional\\)"],
      ["task-start-date", "Start date"],
      ["task-start-time", "Start time \\(optional\\)"],
      ["task-list", "List"],
      ["task-tags", "Tags"],
    ]
  ) {
    expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>${text}`))
    expect(html).toMatch(new RegExp(`<(input|textarea|select)[^>]*id="${id}"`))
  }
  expect(html).toMatch(/<h1[^>]*>.*Edit task.*<\/h1>/)
})

Deno.test("the form shows the task's values, with the high band checked for a priority of 3", () => {
  const html = renderToString(<TaskEditorScreen {...props()} />)
  expect(html).toContain(`value="Water the plants"`)
  expect(html).toContain(`value="2026-10-12"`)
  expect(html).toContain(`value="09:30"`)
  expect(html).toContain(`value="${PriorityBand.High}" checked`)
  expect(html.match(/ checked /g)).toHaveLength(1)
})

Deno.test("Save hands over the whole form, and untouched dates and priority come back exactly as stored", async () => {
  const saved: TaskDraft[] = []
  const stored = task()
  await mount(async (root) => {
    await type(root, "task-title", "  Water the ferns  ")
    await press(e2e(root, "task-save"))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual({
      title: "Water the ferns",
      notes: "Ferns need less.",
      due: stored.due!,
      start: null,
      priority: 3,
      listHref: "/cal/home/",
      tags: ["home", "garden"],
    })
    expect(saved[0].due).toBe(stored.due!)
  }, props({ task: stored, onSave: (draft) => saved.push(draft) }))
})

Deno.test("a new due time keeps the zone, a new date without a time becomes a plain date, and a cleared date becomes null", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root) => {
    await type(root, "task-due-time", "11:45")
    await type(root, "task-start-date", "2026-10-10")
    await press(e2e(root, "task-save"))
    expect(saved[0].due).toEqual({
      kind: IcalDateKind.Zoned,
      date: "2026-10-12",
      time: "11:45:00",
      tzid: "Europe/Berlin",
    })
    expect(saved[0].start).toEqual({ kind: IcalDateKind.Date, date: "2026-10-10" })

    await type(root, "task-due-time", "")
    await type(root, "task-due-date", "")
    await press(e2e(root, "task-save"))
    expect(saved[1].due).toBeNull()
  }, props({ onSave: (draft) => saved.push(draft) }))
})

Deno.test("picking a priority band saves its number: none 0, low 9, medium 5, high 1", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root) => {
    const radio = (band: PriorityBand) =>
      root.querySelector(`input[name="priority"][value="${band}"]`) as HTMLInputElement
    await press(radio(PriorityBand.Low))
    await press(e2e(root, "task-save"))
    expect(saved[0].priority).toBe(9)

    await press(radio(PriorityBand.Medium))
    await press(e2e(root, "task-save"))
    expect(saved[1].priority).toBe(5)

    await press(radio(PriorityBand.None))
    await press(e2e(root, "task-save"))
    expect(saved[2].priority).toBe(0)

    await press(radio(PriorityBand.High))
    await press(e2e(root, "task-save"))
    expect(saved[3].priority).toBe(1)
  }, props({ onSave: (draft) => saved.push(draft) }))
})

Deno.test("an empty title is not sent: focus moves to the title, which names its error", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root, window) => {
    await type(root, "task-title", "   ")
    await press(e2e(root, "task-save"))
    expect(saved).toEqual([])
    const title = e2e(root, "task-title") as HTMLInputElement
    expect(window.document.activeElement?.id).toBe("task-title")
    expect(title.getAttribute("aria-invalid")).toBe("true")
    const message = window.document.getElementById(title.getAttribute("aria-describedby")!)
    expect(message?.textContent).toBe("Enter a title.")
  }, props({ onSave: (draft) => saved.push(draft) }))
})

Deno.test("with two fields in error, focus goes to the first one on the page", async () => {
  await mount(async (root, window) => {
    await type(root, "task-title", "")
    await type(root, "task-start-time", "08:00")
    await press(e2e(root, "task-save"))
    expect(window.document.activeElement?.id).toBe("task-title")
    expect((e2e(root, "task-start-date") as HTMLElement).getAttribute("aria-invalid")).toBe("true")
  }, props({ task: task({ title: "Water" }) }))
})

Deno.test("a time without a date is refused on the date field, and the next refusal focuses it again", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root, window) => {
    await type(root, "task-start-time", "08:00")
    await press(e2e(root, "task-save"))
    const date = e2e(root, "task-start-date") as HTMLInputElement
    expect(saved).toEqual([])
    expect(window.document.activeElement?.id).toBe(date.id)
    expect(root.textContent).toContain("Pick a start date for this time.")

    date.blur()
    await press(e2e(root, "task-save"))
    expect(window.document.activeElement?.id).toBe(date.id)
  }, props({ onSave: (draft) => saved.push(draft) }))
})

Deno.test("an error the caller passes (a refused save) is tied to its field and takes the focus", async () => {
  await mount(async (root, window, rerender) => {
    await rerender(props({ errors: { due: "The due date is before the start date." } }))
    const date = e2e(root, "task-due-date") as HTMLInputElement
    expect(window.document.activeElement?.id).toBe(date.id)
    const message = window.document.getElementById(date.getAttribute("aria-describedby")!)
    expect(message?.textContent).toBe("The due date is before the start date.")
    await rerender(props({ errors: { form: "The server is unreachable." } }))
    expect(e2e(root, "task-form-error").textContent).toBe("The server is unreachable.")
  }, props())
})

Deno.test("leaving with unsaved changes asks first, Stay keeps the page and Leave goes", async () => {
  const went: string[] = []
  await mount(async (root, window) => {
    // No change yet: Cancel goes straight away.
    await press(e2e(root, "task-cancel"))
    expect(went).toEqual(["/lists/home"])

    await type(root, "task-title", "Water the ferns")
    await press(e2e(root, "task-cancel"))
    expect(went).toEqual(["/lists/home"])
    const dialog = window.document.querySelector("dialog")!
    expect(dialog.textContent).toContain("Leave without saving?")

    const stay = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Stay")!
    await press(stay as never)
    expect(went).toEqual(["/lists/home"])

    await press(e2e(root, "task-cancel"))
    const leave = [...window.document.querySelectorAll("dialog button")]
      .find((b) => b.textContent === "Leave")!
    await press(leave as never)
    expect(went).toEqual(["/lists/home", "/lists/home"])
  }, props({ backHref: "/lists/home", navigate: (href) => went.push(href) }))
})

Deno.test("a saved version (new etag) resets the form, so it no longer counts as changed", async () => {
  const went: string[] = []
  const base = props({ navigate: (href) => went.push(href) })
  await mount(async (root, window, rerender) => {
    await type(root, "task-title", "Water the ferns")
    await rerender({ ...base, task: task({ title: "Water the ferns", etag: `"v2"` }) })
    expect((e2e(root, "task-title") as HTMLInputElement).value).toBe("Water the ferns")
    await press(e2e(root, "task-cancel"))
    expect(window.document.querySelector("dialog") === null).toBe(true)
    expect(went).toEqual(["/"])
  }, base)
})

Deno.test("Delete is in More actions, asks first, and only the confirmed Delete calls onDelete", async () => {
  let deleted = 0
  await mount(async (root, window) => {
    const more = root.querySelector(`[data-e2e="task-menu"]`) as HTMLElement
    expect(more.getAttribute("aria-label") ?? more.textContent).toContain("More actions")
    await press(more)
    await press(e2e(root, "task-delete"))
    expect(deleted).toBe(0)
    const dialog = window.document.querySelector(`[data-e2e="task-delete-dialog"]`)!
    expect(dialog.textContent).toContain(`"Water the plants" will be deleted.`)

    await press(
      [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Keep it") as never,
    )
    expect(deleted).toBe(0)
    expect(window.document.querySelector(`[data-e2e="task-delete-dialog"]`) === null).toBe(true)

    await press(more)
    await press(e2e(root, "task-delete"))
    const again = window.document.querySelector(`[data-e2e="task-delete-dialog"]`)!
    await press(
      [...again.querySelectorAll("button")].find((b) => b.textContent === "Delete") as never,
    )
    expect(deleted).toBe(1)
  }, props({ onDelete: () => deleted++ }))
})

Deno.test("without onDelete there is no More actions menu", () => {
  const html = renderToString(<TaskEditorScreen {...props()} />)
  expect(html).not.toContain(`data-e2e="task-menu"`)
})

const THEIRS = () => task({ etag: `"v2"`, title: "Water" })

Deno.test("a conflict shows Changed on another device and keeps what was typed until a choice is made", async () => {
  await mount(async (root, window, rerender) => {
    expect(window.document.querySelector(`[data-e2e="task-conflict-dialog"]`) === null).toBe(true)
    await type(root, "task-title", "Water the ferns")
    await rerender(props({ conflict: true, task: THEIRS() }))
    const dialog = window.document.querySelector(`[data-e2e="task-conflict-dialog"]`)!
    expect(dialog.textContent).toContain("Changed on another device")
    expect((e2e(root, "task-title") as HTMLInputElement).value).toBe("Water the ferns")
  }, props())
})

Deno.test("Use theirs replaces the form with their version, and leaving then asks nothing", async () => {
  const chosen: string[] = []
  const went: string[] = []
  const base = props({
    onUseTheirs: () => chosen.push("theirs"),
    navigate: (href) => went.push(href),
  })
  await mount(async (root, window, rerender) => {
    await type(root, "task-title", "Water the ferns")
    await rerender({ ...base, conflict: true, task: THEIRS() })
    await press(window.document.querySelector(`[data-e2e="task-conflict-use-theirs"]`) as never)
    expect(chosen).toEqual(["theirs"])
    expect((e2e(root, "task-title") as HTMLInputElement).value).toBe("Water")

    await rerender({ ...base, conflict: false, task: THEIRS() })
    await press(e2e(root, "task-cancel"))
    expect(window.document.querySelector("dialog") === null).toBe(true)
    expect(went).toEqual(["/"])
  }, base)
})

Deno.test("Keep mine hands over the form as typed and leaves the form as it is", async () => {
  const kept: TaskDraft[] = []
  const base = props({ onKeepMine: (draft) => kept.push(draft) })
  await mount(async (root, window, rerender) => {
    await type(root, "task-title", "Water the ferns")
    await rerender({ ...base, conflict: true, task: THEIRS() })
    await press(window.document.querySelector(`[data-e2e="task-conflict-keep-mine"]`) as never)
    expect(kept.map((draft) => draft.title)).toEqual(["Water the ferns"])

    await rerender({ ...base, conflict: false, task: THEIRS() })
    expect((e2e(root, "task-title") as HTMLInputElement).value).toBe("Water the ferns")
  }, base)
})

Deno.test("the subtask form sits outside the editor's form, so Enter in it cannot save the task", async () => {
  await mount(async (root) => {
    const editor = e2e(root, "task-save").closest("form")!
    const subtaskForm = e2e(root, "task-subtask-form")
    expect(editor.contains(subtaskForm as never)).toBe(false)
    expect(subtaskForm.tagName).toBe("FORM")
    expect(root.querySelectorAll("form").length).toBe(2)
  }, props({ onAddSubtask: () => {} }))
})

const UTC_DUE = (): Task =>
  task({ due: { kind: IcalDateKind.Utc, date: "2026-10-12", time: "23:30:00" } })

Deno.test("a UTC time is shown in the given zone, and an untouched one is saved exactly as stored", async () => {
  const saved: TaskDraft[] = []
  const stored = UTC_DUE()
  await mount(async (root) => {
    expect((e2e(root, "task-due-date") as HTMLInputElement).value).toBe("2026-10-13")
    expect((e2e(root, "task-due-time") as HTMLInputElement).value).toBe("08:30")
    await type(root, "task-title", "Water")
    await press(e2e(root, "task-save"))
    expect(saved[0].due).toBe(stored.due!)
  }, props({ task: stored, timeZone: "Asia/Tokyo", onSave: (draft) => saved.push(draft) }))
})

Deno.test("a UTC time edited in the given zone is written back as UTC", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root) => {
    await type(root, "task-due-time", "09:00")
    await press(e2e(root, "task-save"))
    expect(saved[0].due).toEqual({ kind: IcalDateKind.Utc, date: "2026-10-13", time: "00:00:00" })

    await type(root, "task-due-date", "2026-10-14")
    await type(root, "task-due-time", "06:15")
    await press(e2e(root, "task-save"))
    expect(saved[1].due).toEqual({ kind: IcalDateKind.Utc, date: "2026-10-13", time: "21:15:00" })
  }, props({ task: UTC_DUE(), timeZone: "Asia/Tokyo", onSave: (draft) => saved.push(draft) }))
})

Deno.test("a floating time is shown and saved as written whatever zone is given", async () => {
  const saved: TaskDraft[] = []
  const floating = task({
    due: { kind: IcalDateKind.Floating, date: "2026-10-12", time: "09:30:00" },
  })
  await mount(async (root) => {
    expect((e2e(root, "task-due-time") as HTMLInputElement).value).toBe("09:30")
    await type(root, "task-due-time", "10:00")
    await press(e2e(root, "task-save"))
    expect(saved[0].due).toEqual({
      kind: IcalDateKind.Floating,
      date: "2026-10-12",
      time: "10:00:00",
    })
  }, props({ task: floating, timeZone: "Asia/Tokyo", onSave: (draft) => saved.push(draft) }))
})

Deno.test("the repeat rule is read-only and described in words, and a rule the library cannot read is shown as written", () => {
  const weekly = renderToString(
    <TaskEditorScreen
      {...props({ task: task({ repeatRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH" }) })}
    />,
  )
  expect(weekly).toMatch(/data-e2e="task-repeat-label">Every 2 weeks on Mon, Thu</)
  expect(weekly).toMatch(/<h2[^>]*>Repeats<\/h2>/)
  expect(weekly).not.toMatch(/name="repeat/)

  const odd = renderToString(
    <TaskEditorScreen {...props({ task: task({ repeatRule: "FREQ=SECONDLY;BYSETPOS=1" }) })} />,
  )
  expect(odd).toContain(">FREQ=SECONDLY;BYSETPOS=1<")

  expect(renderToString(<TaskEditorScreen {...props()} />)).not.toContain("task-repeat")
})

Deno.test("reminders are listed under a heading and cannot be edited", () => {
  const html = renderToString(
    <TaskEditorScreen
      {...props({
        task: task({
          reminders: [reminder("-PT15M", AlarmRelated.End), reminder("-PT1H"), {
            trigger: "20261010T080000Z",
            alarm: {
              kind: AlarmTriggerKind.Absolute,
              at: { kind: IcalDateKind.Utc, date: "2026-10-10", time: "08:00:00" },
            },
          }],
        }),
        timeZone: "Asia/Ho_Chi_Minh",
      })}
    />,
  )
  expect(html).toMatch(/<h2[^>]*>Reminders<\/h2>/)
  // Counted from due is not counted from start, and a fixed moment reads in the viewer's zone.
  expect(html).toContain("15 minutes before due")
  expect(html).toContain("1 hour before start")
  expect(html).toContain("15:00")
  expect(html).not.toMatch(/name="remind/)
  expect(renderToString(<TaskEditorScreen {...props()} />)).not.toContain("task-reminders")
})

Deno.test("subtasks are listed, and Add subtask sends the trimmed title and clears the field", async () => {
  const added: string[] = []
  const subtasks = [
    task({ uid: "s1", title: "Buy soil", parentUid: "uid-1" }),
    task({ uid: "s2", title: "Find can", status: TaskStatus.Completed }),
  ]
  await mount(async (root) => {
    const items = [...root.querySelectorAll(`[data-e2e="task-subtask"]`)]
    expect(items.map((item) => item.textContent)).toEqual(["Buy soil", "Find can(done)"])
    expect(items[1].className).toContain("line-through")

    await type(root, "task-subtask-title", "   ")
    await press(e2e(root, "task-subtask-add"))
    expect(added).toEqual([])

    await type(root, "task-subtask-title", "  Pick a pot ")
    await press(e2e(root, "task-subtask-add"))
    expect(added).toEqual(["Pick a pot"])
    expect((e2e(root, "task-subtask-title") as HTMLInputElement).value).toBe("")
  }, props({ subtasks, onAddSubtask: (title) => added.push(title) }))
})

Deno.test("a running save disables the form, shows the wait on Save and sends nothing more", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root) => {
    const button = e2e(root, "task-save") as HTMLButtonElement
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect((root.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true)
    const form = root.querySelector("form")!
    await act(() => {
      form.requestSubmit()
    })
    expect(saved).toEqual([])
  }, props({ saving: true, onSave: (draft) => saved.push(draft) }))
})

Deno.test("the list choice offers every list and saves the picked one", async () => {
  const saved: TaskDraft[] = []
  await mount(async (root, window) => {
    const select = e2e(root, "task-list") as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual(["Home", "Work"])
    await act(() => {
      select.value = "/cal/work/"
      select.dispatchEvent(new window.Event("change", { bubbles: true }) as never)
    })
    await press(e2e(root, "task-save"))
    expect(saved[0].listHref).toBe("/cal/work/")
  }, props({ onSave: (draft) => saved.push(draft) }))
})
