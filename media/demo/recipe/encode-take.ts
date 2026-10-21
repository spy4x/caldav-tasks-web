/// <reference lib="deno.ns" />
/// <reference lib="es2022" />
/**
 * Encodes the last raw take (`media/demo/.take/`, written by record.ts) with `captions.vtt` and
 * `music.opus` into `media/demo/`: `deno task demo-video:encode`. A caption or music change needs
 * only this step, not a new recording.
 */
import { encodeDemo } from "./encode.ts"

const DEMO = new URL(`..`, import.meta.url).pathname.replace(/\/$/, ``)

await encodeDemo({
  take: `${DEMO}/.take/list.txt`,
  out: DEMO,
  title: `caldav-tasks-web`,
  claim: `A web companion to Tasks.org for your own CalDAV server`,
  end: `github.com/spy4x/caldav-tasks-web`,
  poster: `${DEMO}/.take/poster.png`,
})
