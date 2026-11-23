/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { mount, must } from "./mount.test.tsx"
import {
  insertMention,
  mentionedLists,
  type MentionList,
  mentionQuery,
  renameMentions,
  withoutMentions,
} from "./mentions.tsx"
import { TaskRow } from "./task-row.tsx"
import { makeTask } from "./task-fixtures.ts"

const LISTS: MentionList[] = [
  { name: `Ceramic Courses`, href: `/lists/ceramic-courses`, color: `#aa5500` },
  { name: `Ceramic`, href: `/lists/ceramic` },
  { name: `Tunes`, href: `/lists/tunes` },
]

Deno.test("an @ at the start or after a space starts a mention, up to the caret", () => {
  expect(mentionQuery(`Ceramics @Cer`, 13)).toEqual({ start: 9, query: `Cer` })
  expect(mentionQuery(`@`, 1)).toEqual({ start: 0, query: `` })
  expect(mentionQuery(`see @Ceramic Co`, 15)).toEqual({ start: 4, query: `Ceramic Co` })
  expect(mentionQuery(`mail a@b.com`, 12)).toBeNull()
  expect(mentionQuery(`@Tunes\nnext`, 11)).toBeNull()
})

Deno.test("picking a list writes @Name and a space, and puts the caret after it", () => {
  expect(insertMention(`Ceramics @cer more`, 9, 13, `Ceramic Courses`)).toEqual({
    text: `Ceramics @Ceramic Courses more`,
    caret: 26,
  })
})

Deno.test("a text mentions a list by its whole name, in any case, and not inside a word", () => {
  const names = (text: string) => mentionedLists(text, LISTS).map((list) => list.name)
  expect(names(`Ceramics @ceramic courses`)).toEqual([`Ceramic Courses`])
  expect(names(`@Tunes, and @Ceramic.`)).toEqual([`Ceramic`, `Tunes`])
  expect(names(`@Tunesmith`)).toEqual([])
  expect(names(`x@Tunes`)).toEqual([])
})

Deno.test("renaming a list renames its mentions and leaves a longer name alone", () => {
  expect(renameMentions(`@Ceramic and @Ceramic Courses`, `Ceramic`, `Pottery`, [
    `Ceramic`,
    `Ceramic Courses`,
  ])).toBe(
    `@Pottery and @Ceramic Courses`,
  )
  expect(withoutMentions(`Ceramics @Ceramic Courses now`, [LISTS[0]])).toBe(`Ceramics now`)
})

Deno.test("a row shows its mentions as links beside its tags, and its title without them", async () => {
  const went: string[] = []
  const task = makeTask(`c`, `Ceramics @Ceramic Courses`, { notes: `Also @Tunes` })
  await mount(
    <ul>
      <TaskRow
        task={task}
        zone="UTC"
        now={new Date(`2026-11-18T09:00:00Z`)}
        onComplete={() => {}}
        onOpen={() => {}}
        mentionLists={LISTS}
        navigate={(href) => went.push(href)}
      />
    </ul>,
    async ({ root, act }) => {
      expect(must(root, `[data-e2e="task-open"]`).textContent).toBe(`Ceramics`)
      const links = [...root.querySelectorAll<HTMLAnchorElement>(`[data-e2e="task-mention"]`)]
      expect(links.map((link) => link.textContent)).toEqual([`Ceramic Courses`, `Tunes`])
      await act(() => links[0].click())
      expect(went).toEqual([`/lists/ceramic-courses`])
    },
  )
})
