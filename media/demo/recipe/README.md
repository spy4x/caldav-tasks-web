# Demo video recipe

`media/demo/` holds the one copy of the caldav-tasks-web demo video: `demo.webm`, `demo.mp4`, two
posters, `captions.vtt`, and its music (`music.opus`, credited in `MUSIC.md`). The README,
antonshubin.com and any other site take these files; they never record their own.

## Remake the video

1. Install Docker, Deno 2, ffmpeg (with libvpx-vp9, libx264, libopus, libwebp and drawtext) and
   Playwright's Chromium (`deno run -A npm:playwright@1.57.0 install chromium`).
2. From the repository root, run `deno task demo-video`. It takes about three minutes:
   - starts a throwaway Radicale on port 35466 and seeds it with made-up lists (`seed.ts`);
   - builds this checkout and starts the server on port 38466 with the fixed test values of
     `e2e/env.ts`;
   - records one take in headless Chromium (`record.ts`) into `media/demo/.take/` (gitignored), and
     writes `captions.vtt` from the shot list, timed by when each step started;
   - encodes the four outputs (`encode-take.ts`), with the title card, the burned-in captions, the
     end card and the music, and prints the length, sizes and loudness.

   Radicale and the server stop on success and on failure. `RADICALE_PORT` and `APP_PORT` change
   the ports.
3. Look at a contact sheet before committing:
   `ffmpeg -i media/demo/demo.mp4 -vf "fps=1,scale=320:-1,tile=6x8" -frames:v 1 sheet.png`.

## Change only the captions or the music

Edit `media/demo/captions.vtt` (or replace `music.opus` and `MUSIC.md`), then run
`deno task demo-video:encode`. It encodes the last take again, without recording. The encoder
refuses captions too short to read or too long for one line, and a mix louder than -27 LUFS or
above -1 dBTP. A new recording rewrites `captions.vtt` from the texts in `record.ts`, so change a
caption's text there too.

## Files

- `run.sh`: the whole run, behind `deno task demo-video`.
- `seed.ts`: the made-up lists and tasks, written to Radicale the way Tasks.org writes them.
- `record.ts`: the shot list, one caption per step. It records Chrome's screencast frames with the
  time Chrome painted each one, so a busy machine does not change the video's timing.
- `encode-take.ts` and `encode.ts`: the encoder (`encode.ts` comes from the global `demo-video`
  skill).
- `pointer.js`, `keys.js`, `human-mouse.ts`: the drawn pointer and click marks, the key caps, and a
  mouse that moves like a person (also from the `demo-video` skill).
