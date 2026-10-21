/// <reference lib="deno.ns" />
/// <reference lib="es2022" />
/**
 * Records the demo video's take against an app that is already running and seeded (`run.sh`
 * starts both):
 *
 *   deno run -A media/demo/recipe/record.ts <app-url> <take-dir>
 *
 * It signs in on a context that is not recorded, then records one take in a second context with
 * the saved session, so no sign-in appears in the video. Chrome's screencast sends a 1280×800
 * JPEG each time the page paints; each frame keeps the time Chrome painted it (not the time it
 * reached this script), so a loaded machine delays frames without changing the video's timing.
 *
 * Writes `<take-dir>/frames/*.jpg`, `<take-dir>/list.txt` (the ffmpeg concat list with each
 * frame's duration), `<take-dir>/poster.png` (the opening screen, no pointer), and
 * `media/demo/captions.vtt` from the shot list below, timed by when each step started.
 */
import { type CDPSession, chromium, type Locator, type Page } from "playwright"
import { OWNER_PASSWORD } from "../../../e2e/env.ts"
import { CAPTION_TIMING, CARD_SECONDS, type Cue, FPS } from "./encode.ts"
import { clickLike, moveLike, parkLike, type Point, scrollLike, typeLike } from "./human-mouse.ts"

const [APP, TAKE] = Deno.args
if (!APP || !TAKE) throw new Error(`usage: record.ts <app-url> <take-dir>`)
const HERE = new URL(`.`, import.meta.url).pathname
const CAPTIONS = new URL(`../captions.vtt`, import.meta.url).pathname

const VIEWPORT = { width: 1280, height: 800 }
/**
 * The page is enlarged with CSS zoom on `<body>`, so a task's title renders at about 30 px in the
 * 1280×800 video and stays readable when a site plays the clip about 530 px wide. The pointer and
 * key caps hang off `<html>`, outside the zoom. The extra bottom padding lets the last rows of a
 * page scroll above the caption band.
 */
const ZOOM = 1.9
/** The task editor is wider than a list: at `ZOOM` its right-hand inputs and Save are clipped. */
const EDITOR_ZOOM = 1.25
const CONTEXT = {
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: `dark` as const,
  timezoneId: `UTC`,
  locale: `en-GB`,
  serviceWorkers: `block` as const,
}
/** The caption band the encoder draws over the bottom of the video, plus a margin. */
const BAND = 110
/** Where the pointer starts and rests between steps: right of the content, above the captions. */
const REST: Point = { x: 1180, y: 520 }

/** One screencast frame on disk and when Chrome painted it, in seconds since the epoch. */
interface Frame {
  file: string
  at: number
}

/** Collects the screencast's frames into `<take-dir>/frames/`. */
class Recorder {
  readonly frames: Frame[] = []
  private writes: Promise<void>[] = []
  constructor(private readonly cdp: CDPSession, private readonly dir: string) {}

  async start(): Promise<void> {
    this.cdp.on(`Page.screencastFrame`, async ({ data, metadata, sessionId }) => {
      const at = metadata.timestamp ?? Date.now() / 1000
      const file = `${this.dir}/${String(this.frames.length).padStart(6, `0`)}.jpg`
      this.frames.push({ file, at })
      // Ack first: Chrome sends the next frame only after the ack, so a slow write drops none.
      this.cdp.send(`Page.screencastFrameAck`, { sessionId }).catch(() => {})
      const write = Deno.writeFile(file, Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))
      this.writes.push(write)
      await write
    })
    await this.cdp.send(`Page.startScreencast`, {
      format: `jpeg`,
      quality: 92,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    })
  }

  async stop(): Promise<void> {
    await this.cdp.send(`Page.stopScreencast`)
    await Promise.all(this.writes)
  }

  /**
   * The concat list from the first frame to `end`: each frame lasts until the next one was
   * painted. The demuxer ignores the last entry's duration unless the file is listed once more.
   */
  list(end: number): string {
    const lines: string[] = []
    this.frames.forEach((frame, index) => {
      const next = this.frames[index + 1]?.at ?? end
      lines.push(`file '${frame.file}'`, `duration ${Math.max(0, next - frame.at).toFixed(4)}`)
    })
    const last = this.frames.at(-1)!
    lines.push(`file '${last.file}'`, `duration ${(1 / FPS).toFixed(4)}`)
    return lines.join(`\n`) + `\n`
  }
}

const now = () => Date.now() / 1000
const pause = (page: Page, ms: number) => page.waitForTimeout(ms)

/** One step of the shot list: its caption and when it started, in seconds since the epoch. */
const steps: { text: string; at: number }[] = []

/**
 * Runs one step under its caption, then holds the screen until the caption has been on long
 * enough to read (and at least `hold` ms after the step's last action).
 */
async function step(page: Page, text: string, action: () => Promise<void>, hold = 1500) {
  const at = now()
  steps.push({ text, at })
  await action()
  await pause(page, hold)
  const needs = Math.max(CAPTION_TIMING.minSeconds, text.length / CAPTION_TIMING.charsPerSecond)
  const left = at + needs + 0.3 - now()
  if (left > 0) await pause(page, left * 1000)
}

/** Glides the pointer onto `target` without clicking. */
async function hover(page: Page, pointer: Point, target: Locator) {
  await target.waitFor()
  const box = await target.boundingBox()
  if (!box) throw new Error(`hover target has no box`)
  await moveLike(page, pointer, {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  })
}

/** Scrolls with the wheel until `target` sits above the caption band. */
async function reveal(page: Page, target: Locator) {
  await target.waitFor()
  const box = await target.boundingBox()
  if (!box) throw new Error(`reveal target has no box`)
  const over = box.y + box.height - (VIEWPORT.height - BAND - 20)
  if (over > 0) await scrollLike(page, Math.round(over))
}

/**
 * Clicks `target` like `clickLike` (glide, press, hold, release) and sets the page's zoom, with the
 * bottom padding that keeps the last rows above the captions, when the screen it opens renders:
 * a mutation observer applies it as soon as the `<h1>` changes, before that screen's first paint.
 */
async function clickAndZoom(page: Page, pointer: Point, target: Locator, zoom: number) {
  await page.evaluate(([z, pad]) => {
    const before = document.querySelector(`h1`)?.textContent
    const observer = new MutationObserver(() => {
      if (document.querySelector(`h1`)?.textContent === before) return
      observer.disconnect()
      document.body.style.zoom = String(z)
      document.body.style.paddingBottom = `${pad}px`
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  }, [zoom, Math.round(BAND / zoom)])
  await hover(page, pointer, target)
  await pause(page, 150)
  await page.mouse.down()
  await pause(page, 200)
  await page.mouse.up()
  await pause(page, 200)
}

/** Presses one key with a pause after it, so its key cap can be read. */
async function key(page: Page, name: string, after = 800) {
  await page.keyboard.press(name)
  await pause(page, after)
}

/** `mm:ss.ttt` for WebVTT. */
function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = (seconds - m * 60).toFixed(3).padStart(6, `0`)
  return `${String(m).padStart(2, `0`)}:${s}`
}

/** The captions file: each step's caption from its start until the next step (or the end). */
function vtt(first: number, end: number): string {
  const cues: Cue[] = steps.map((s, i) => ({
    start: CARD_SECONDS.title + s.at - first,
    end: CARD_SECONDS.title + (steps[i + 1]?.at ?? end) - first,
    text: s.text,
  }))
  return `WEBVTT\n\n` +
    cues.map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join(`\n`)
}

const frameDir = `${TAKE}/frames`
await Deno.remove(TAKE, { recursive: true }).catch(() => {})
await Deno.mkdir(frameDir, { recursive: true })

const browser = await chromium.launch()
try {
  const login = await browser.newContext(CONTEXT)
  const loginPage = await login.newPage()
  await loginPage.goto(APP)
  await loginPage.getByLabel(`Password`).fill(OWNER_PASSWORD)
  await loginPage.getByRole(`button`, { name: `Sign in` }).click()
  await loginPage.getByRole(`heading`, { name: `Today`, level: 1 }).waitFor()
  const storageState = await login.storageState()
  await login.close()

  const context = await browser.newContext({ ...CONTEXT, storageState })
  try {
    await context.addInitScript(`window.__demoPointerOptions = ${JSON.stringify(REST)}`)
    await context.addInitScript(
      `document.addEventListener("DOMContentLoaded", () => {
        document.body.style.zoom = "${ZOOM}"
        document.body.style.paddingBottom = "${Math.round(BAND / ZOOM)}px"
      })`,
    )
    await context.addInitScript({ path: `${HERE}pointer.js` })
    await context.addInitScript({ path: `${HERE}keys.js` })
    const page = await context.newPage()
    const main = page.getByRole(`main`)
    const pointer: Point = { ...REST }

    await page.goto(APP)
    await main.getByText(`Fix the gate`).waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.mouse.move(pointer.x, pointer.y)
    // Both overdue rows, with their list names, above the caption band from the first frame.
    await reveal(page, main.getByText(`Yesterday`, { exact: true }))
    await page.evaluate(`__demoPointerVisible(false)`)
    await page.screenshot({ path: `${TAKE}/poster.png` })
    await page.evaluate(`__demoPointerVisible(true)`)
    await pause(page, 300)

    const rec = new Recorder(await context.newCDPSession(page), frameDir)
    await rec.start()
    await pause(page, 300)

    await step(page, `Today gathers the overdue tasks from every list`, async () => {
      await pause(page, 1500)
    })

    await step(page, `Quick add understands a tag, a time and a priority`, async () => {
      await typeLike(page, pointer, main.getByLabel(`New task`), `Order compost #garden 5pm !1`)
    })

    await step(page, `Enter saves it to your CalDAV server and it shows in Today`, async () => {
      await page.keyboard.press(`Enter`)
      await parkLike(page, pointer, REST)
      await reveal(page, main.getByRole(`button`, { name: `Order compost`, exact: true }))
    }, 2000)

    await step(page, `Open a list: Plan the garden has two subtasks`, async () => {
      await clickLike(page, pointer, page.getByRole(`link`, { name: `Lists` }))
      await pause(page, 600)
      await clickLike(page, pointer, main.getByText(`Errands`, { exact: true }))
      await parkLike(page, pointer, REST)
      await reveal(page, main.getByRole(`button`, { name: `Clear the beds`, exact: true }))
    })

    await step(page, `Reorder from the keyboard: Space, arrow up, Space`, async () => {
      const handle = main.getByRole(`button`, { name: `Reorder Clear the beds` })
      await hover(page, pointer, handle)
      await handle.focus()
      await pause(page, 500)
      await key(page, `Space`)
      await key(page, `ArrowUp`)
      await key(page, `Space`, 600)
      await parkLike(page, pointer, REST)
    })

    const repeat = main.getByLabel(`Repeat`, { exact: true })
    await step(page, `Open a task and make it repeat every week`, async () => {
      const task = main.getByRole(`button`, { name: `Water the plants`, exact: true })
      await clickAndZoom(page, pointer, task, EDITOR_ZOOM)
      await repeat.waitFor()
      await pause(page, 900)
      const box = await repeat.boundingBox()
      if (box) await scrollLike(page, Math.round(box.y - VIEWPORT.height * 0.35))
      await hover(page, pointer, repeat)
      await pause(page, 400)
      await repeat.selectOption({ label: `Weekly` })
    }, 1800)

    await step(page, `Save: it is written back the way Tasks.org wrote it`, async () => {
      const save = main.getByRole(`button`, { name: `Save`, exact: true })
      const box = await save.boundingBox()
      if (box && box.y + box.height > VIEWPORT.height - BAND - 20) {
        await scrollLike(page, Math.round(box.y - VIEWPORT.height / 2))
      }
      await clickAndZoom(page, pointer, save, ZOOM)
      await parkLike(page, pointer, REST)
    })

    await step(page, `Complete a task, and Undo brings it back`, async () => {
      await clickLike(page, pointer, page.getByRole(`link`, { name: `Today` }))
      await main.getByText(`Call the plumber`).waitFor()
      await pause(page, 500)
      await clickLike(
        page,
        pointer,
        main.getByRole(`checkbox`, { name: `Complete Call the plumber` }),
      )
      const undo = page.getByRole(`button`, { name: `Undo` })
      await undo.waitFor()
      await pause(page, 900)
      await clickLike(page, pointer, undo)
      await main.getByRole(`button`, { name: `Call the plumber`, exact: true }).waitFor()
      await parkLike(page, pointer, REST)
    })

    await step(page, `Press ? to see every keyboard shortcut`, async () => {
      await page.locator(`body`).focus()
      await key(page, `?`, 2200)
      await key(page, `Escape`, 300)
    }, 1200)

    const end = now()
    await rec.stop()
    const first = rec.frames[0]?.at
    if (first === undefined) throw new Error(`the screencast sent no frame`)
    await Deno.writeTextFile(`${TAKE}/list.txt`, rec.list(end))
    await Deno.writeTextFile(CAPTIONS, vtt(first, end))
    console.log(`take: ${rec.frames.length} frames, ${(end - first).toFixed(1)} s`)
  } finally {
    await context.close()
  }
} finally {
  await browser.close()
}
