import { useNow } from "@spy4x/preact-signals/now"
import { type Signal, useSignal } from "@preact/signals"
import { useEffect, useState } from "preact/hooks"
import type { ComponentChildren } from "preact"
import { IconChevronDown } from "@spy4x/preact-icons"
import type { TaskList } from "@spy4x/time/ical-tasks-model"
import { useLocation, useParams, useSearch } from "wouter-preact"
import { useUrlFilters } from "@spy4x/preact-signals/use-url-filters"
import { mentionLists } from "../state/mention-lists.ts"
import { CompletedRange, ListScreen } from "@ui/list-screen.tsx"
import { LoadingBody } from "@ui/task-screen.tsx"
import { clampShare, TwoLists } from "@ui/two-lists.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { loadCompleted } from "../state/sync.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { homeHref, setHomeList } from "../state/home-list.ts"
import { showOpenCounts } from "../state/open-counts.ts"
import { toasts } from "../state/toasts.ts"
import { findListBySlug, listPath, listSettingsPath, taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { sortFromParam, sortToParam, tagsFromParam, tagsToParam } from "./list-filters.ts"
import { NotFoundView } from "./NotFoundView.tsx"
import { ASK_DELETE } from "./ListSettingsView.tsx"
import { SidebarView } from "./SidebarView.tsx"
import {
  addSiblingTask,
  completeWithUndo,
  deleteWithUndo,
  moveUnder,
  renameTask,
  reorderInList,
} from "./task-actions.ts"
import { useQuickAdd } from "./use-quick-add.ts"

/** This device's layout choices, kept in the browser: a viewer's convenience, nothing more. */
const TWO_LISTS = `two-lists`
const SECOND_LIST = `second-list`
const SHARE = `two-lists-share`
/** The lists whose finished tasks are hidden, as a JSON array of their addresses. */
const HIDE_COMPLETED = `hide-completed`
/** The lists drawn as simple lists, with no checks, as a JSON array of their addresses. */
const SIMPLE_LISTS = `simple-lists`

/** The addresses of the lists a per-list choice is on for. */
function listsWith(key: string): string[] {
  try {
    const parsed = JSON.parse(stored(key) ?? `[]`)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** A yes-or-no choice for one list, kept on this device with the other lists' under `key`. */
function useListChoice(key: string, href: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => listsWith(key).includes(href))
  useEffect(() => setOn(listsWith(key).includes(href)), [href])
  return [on, (next) => {
    setOn(next)
    const others = listsWith(key).filter((other) => other !== href)
    store(key, JSON.stringify(next ? [...others, href] : others))
  }]
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private windows may refuse; the choice then lasts until reload.
  }
}

/**
 * A list, wired. The sort and the tag filter live in the address (`?sort=due&tags=home`), so a
 * reload, a bookmark and the Back button keep them. On a desktop a second list can show beside it;
 * which one, and how wide each is, this device remembers.
 */
export function ListView() {
  const { slug = `` } = useParams<{ slug: string }>()
  const list = findListBySlug(taskLists.value, slug)
  const params = new URLSearchParams(useSearch())
  const sort = useSignal(params.get(`sort`) ?? ``)
  const tags = useSignal(params.get(`tags`) ?? ``)
  const doneParam = useSignal(params.get(`done`) ?? ``)
  useUrlFilters({
    sort: { signal: sort, urlParam: `sort`, initialValue: `` },
    tags: { signal: tags, urlParam: `tags`, initialValue: `` },
    done: { signal: doneParam, urlParam: `done`, initialValue: `` },
  })
  // The second list's sort and filter are its own and stay off the address.
  const secondFilters = { sort: useSignal(``), tags: useSignal(``), done: useSignal(``) }
  const [split, setSplit] = useState(() => stored(TWO_LISTS) === `1`)
  const [secondHref, setSecondHref] = useState(() => stored(SECOND_LIST))
  const [share, setShare] = useState(() => clampShare(Number(stored(SHARE) ?? 50) || 50))

  const [, navigate] = useLocation()

  if (!list) return calendarsLoaded.value ? <NotFoundView /> : <LoadingBody label="Loading list" />
  const others = taskLists.value.filter((other) => other.href !== list.href)
  const second = others.find((other) => other.href === secondHref) ?? others[0]
  const main = { sort, tags, done: doneParam }
  if (!second) return <ListPane list={list} filters={main} />
  const chooseSecond = (href: string) => {
    setSecondHref(href)
    store(SECOND_LIST, href)
  }
  const mainTitle = (
    <ListPicker
      label="List"
      current={list}
      options={taskLists.value}
      e2e={MAIN_LIST_SELECT}
      onPick={(picked) => {
        // The second list stays as it shows, unless it is the one picked: then the two swap.
        chooseSecond(picked.href === second.href ? list.href : second.href)
        navigate(listPath(picked))
      }}
    />
  )

  return (
    <TwoLists
      split={split}
      onSplitChange={(next) => {
        setSplit(next)
        store(TWO_LISTS, next ? `1` : `0`)
      }}
      share={share}
      onShareChange={(next) => {
        setShare(next)
        store(SHARE, String(next))
      }}
      left={<ListPane list={list} filters={main} pane title={mainTitle} />}
      right={
        <ListPane
          key={second.href}
          list={second}
          filters={secondFilters}
          pane
          addHere
          title={
            <ListPicker
              label="Second list"
              current={second}
              options={others}
              e2e="second-list-select"
              onPick={(picked) => chooseSecond(picked.href)}
            />
          }
        />
      }
    />
  )
}

/** The main list's menu, which Alt+L opens. */
export const MAIN_LIST_SELECT = `main-list-select`

/**
 * A list's name as a menu of lists. The name shows as text with a native menu laid invisibly over
 * it: a native menu is as wide as its longest option.
 */
function ListPicker(
  { label, current, options, e2e, onPick }: {
    label: string
    current: TaskList
    options: readonly TaskList[]
    e2e: string
    onPick: (list: TaskList) => void
  },
) {
  return (
    <label class="relative inline-flex min-w-0 items-center gap-1 rounded-md hover:bg-hover focus-within:outline-2 focus-within:outline-[var(--color-ring)]">
      <span class="truncate">{current.name}</span>
      <IconChevronDown class="size-4 shrink-0" aria-hidden="true" />
      <select
        aria-label={label}
        class="absolute inset-0 cursor-pointer text-sm font-normal tracking-normal opacity-0"
        value={current.href}
        onChange={(event) => {
          const picked = options.find((list) => list.href === event.currentTarget.value)
          if (picked) onPick(picked)
        }}
        data-e2e={e2e}
      >
        {options.map((list) => <option key={list.href} value={list.href}>{list.name}</option>)}
      </select>
    </label>
  )
}

/** One list's screen with its own sort, tag filter and completed range. */
function ListPane(
  { list, filters, pane, addHere, title }: {
    list: TaskList
    filters: { sort: Signal<string>; tags: Signal<string>; done: Signal<string> }
    pane?: boolean
    /** Its own one-line New task field, for the second list. */
    addHere?: boolean
    title?: ComponentChildren
  },
) {
  const [, navigate] = useLocation()
  const { sort, tags, done } = filters
  const completedRange = Object.values(CompletedRange).includes(done.value as CompletedRange)
    ? done.value as CompletedRange
    : CompletedRange.Week
  const quickAdd = useQuickAdd({ listHref: list.href })
  const now = useNow({ zone: browserZone() }).value
  useEffect(() => void loadCompleted(list.href), [list.href])
  // ponytail: kept on this device, as the CalDAV client saves only a list's name and colour.
  const [hideDone, setHideDone] = useListChoice(HIDE_COMPLETED, list.href)
  const [simple, setSimple] = useListChoice(SIMPLE_LISTS, list.href)

  return (
    <ListScreen
      list={list}
      pane={pane}
      title={title}
      addField={addHere && (
        <SidebarView compact autoFocus={false} currentPath={listPath(list)} navigate={navigate} />
      )}
      tasks={tasks.value.filter((task) => task.listHref === list.href)}
      zone={browserZone()}
      now={now}
      loading={!calendarsLoaded.value}
      sort={sortFromParam(sort.value)}
      onSortChange={(mode) => sort.value = sortToParam(mode)}
      activeTags={tagsFromParam(tags.value)}
      onActiveTagsChange={(next) => tags.value = tagsToParam(next)}
      completedRange={completedRange}
      onCompletedRangeChange={(range) => done.value = range === CompletedRange.Week ? `` : range}
      onComplete={(task, isDone) => void completeWithUndo(task, isDone)}
      onOpen={(task) => navigate(taskPath(task))}
      onRenameTask={(task, title) => void renameTask(task, title)}
      onAddSibling={addSiblingTask}
      onDeleteTask={(task) => void deleteWithUndo(task)}
      onMoveTask={(task, parent, siblings, to) =>
        void moveUnder(list.href, task, parent, siblings, to, browserZone())}
      onReorder={(task, siblings, to) =>
        void reorderInList(list.href, task, siblings, to, browserZone())}
      onQuickAdd={(parsed) => void quickAdd.add(parsed)}
      quickAddBusy={quickAdd.busy.value}
      navigate={navigate}
      // Name, colour and delete share one settings page; Delete opens it with its question asked.
      onRename={() => navigate(listSettingsPath(list))}
      onChangeColor={() => navigate(listSettingsPath(list))}
      onDelete={() => navigate(`${listSettingsPath(list)}?${ASK_DELETE}`)}
      hideCompleted={hideDone}
      onHideCompletedChange={setHideDone}
      simple={simple}
      onSimpleChange={setSimple}
      showCount={showOpenCounts.value}
      mentionLists={mentionLists(taskLists.value)}
      isHome={homeHref.value === list.href}
      onMakeHome={() => {
        setHomeList(list.href)
        toasts.success({ title: ``, body: `${list.name} is now the default list` })
      }}
    />
  )
}
