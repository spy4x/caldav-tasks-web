/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { mount, texts } from "./mount.test.tsx"
import { type ShortcutRow, ShortcutsHelp } from "./shortcuts.tsx"

const ROWS: ShortcutRow[] = [
  { description: `New task`, group: `Tasks`, keys: [[`n`]] },
  { description: `Edit the focused task`, group: `Tasks`, keys: [[`e`], [`enter`]] },
  { description: `Go to Today`, group: `Go to`, keys: [[`g`, `t`]] },
]

Deno.test("the dialog lists every shortcut under its group heading", async () => {
  await mount(<ShortcutsHelp open onClose={() => {}} shortcuts={ROWS} />, async ({ root }) => {
    expect(texts(root, `h3`)).toEqual([`Tasks`, `Go to`])
    expect(texts(root, `dt`)).toEqual([`New task`, `Edit the focused task`, `Go to Today`])
  })
})

Deno.test("a two-key sequence reads g then t and two ways read e or Enter", async () => {
  await mount(<ShortcutsHelp open onClose={() => {}} shortcuts={ROWS} />, async ({ root }) => {
    const dd = texts(root, `dd`).map((text) => text.replace(/\s+/g, ` `))
    expect(dd[1]).toMatch(/^e\s*or\s*Enter$/i)
    expect(dd[2]).toMatch(/^g\s*then\s*t$/i)
    expect(root.querySelectorAll(`dd kbd`).length).toBeGreaterThan(4)
  })
})

Deno.test("a closed dialog has no shortcuts in the tree", async () => {
  await mount(
    <ShortcutsHelp open={false} onClose={() => {}} shortcuts={ROWS} />,
    async ({ root }) => {
      expect(root.textContent).not.toContain(`New task`)
    },
  )
})
