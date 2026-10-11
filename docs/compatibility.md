# Compatibility

What was tested, and what was not. A row says "tested" only when a test in this repository backs it.
"In daily use" means the author runs it and no automated test does.

## CalDAV servers

| Server    | Version | Status                  | Evidence                                                                                                                                                                           |
| --------- | ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radicale  | 3.5.4   | Tested                  | The browser test suite (`e2e/`, `deno task e2e`) runs against this version, locally (`infra/compose.dev.yml`) and in CI (`.woodpecker/ci.yml`).                                    |
| Stalwart  | 0.16    | In daily use, not in CI | The author's own install runs against it. No automated test talks to a Stalwart server. The fixtures use the task shapes Stalwart 0.16 stores (`libs/tasks/fixtures/tasksorg.ts`). |
| Nextcloud | -       | Untested                | Nobody has tried it, and nothing in this repository shows that it works.                                                                                                           |
| Baikal    | -       | Untested                |                                                                                                                                                                                    |
| Others    | -       | Untested                | A server must offer CalDAV calendars that hold `VTODO` (tasks) and accept the account's username and password.                                                                     |

If you try another server, an issue with the server, its version and what happened helps the next
person.

## CalDAV clients that share the lists

| Client                 | Status                                          | Evidence                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks.org (Android)    | Tested against its file format; not driven live | The unit and browser tests use task files written in Tasks.org's form (its `PRODID`, `RELATED-TO`, `X-APPLE-SORT-ORDER`, default `VALARM`). The author uses the phone app with the same server. No test runs the Android app. |
| Other CalDAV task apps | Untested                                        | Whatever they write is kept as text when you edit a task in the browser, but nothing checks how they read it back.                                                                                                            |

### Which Tasks.org fields round-trip

"Round-trip" here means: a task written the way Tasks.org writes it is read correctly, and an edit in
the browser leaves the rest of the text as it was. The fixtures in `libs/tasks/fixtures/tasksorg.ts`
are made-up tasks in Tasks.org's form, and the tests that use them are in `apps/web/src` and
`apps/server/push`.

| Field in Tasks.org                | In the file                                                         | Covered by the fixtures and tests                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title, notes                      | `SUMMARY`, `DESCRIPTION`                                            | Yes (the repeating task has notes)                                                                                                                        |
| Due date, with or without a time  | `DUE` as a date, a floating time, a UTC time, or a time with a zone | Yes, one task of each kind                                                                                                                                |
| Priority                          | `PRIORITY` 1, 5, 9, 0                                               | The fixtures hold 1 and 5. The editor test saves 0, 1, 5 and 9, and the quick-add test maps its words to 1, 5 and 9.                                      |
| Tags                              | `CATEGORIES`                                                        | Yes                                                                                                                                                       |
| Repeat                            | `RRULE`                                                             | Yes, a daily rule; weekly with days and an end are covered by `e2e/repeat.e2e.ts` against Radicale. A rule the app cannot reproduce is left to Tasks.org. |
| Reminders                         | `VALARM`                                                            | Yes, the default "when due" alarm; kept untouched by an edit (`e2e/tasks.e2e.ts`)                                                                         |
| Subtasks                          | `RELATED-TO` (Tasks.org writes no `RELTYPE`)                        | Yes, including a missing parent and a cycle                                                                                                               |
| Manual order                      | `X-APPLE-SORT-ORDER`                                                | Yes. The expected order in the fixtures was worked out by hand from Tasks.org's rule, not read off a Tasks.org screen.                                    |
| Completed                         | `STATUS`, `COMPLETED`, `PERCENT-COMPLETE`                           | Yes (a completed task is left out of the views)                                                                                                           |
| List colour                       | the calendar's colour, `#RRGGBBAA`                                  | Read (the picker shows `#rrggbb` and drops the alpha); a list made here gets a colour Tasks.org reads (`e2e/lists.e2e.ts`)                                |
| Properties this app does not know | any other line                                                      | Kept as they are (`e2e/tasks.e2e.ts`: `X-E2E-KEEP`)                                                                                                       |

Not covered: a start date in the fixtures, locations, attachments and any other field Tasks.org may
add. The browser keeps such lines when you edit a task, but only the fields in the table are shown.

## Browsers

| Browser                                     | Status   | Evidence                                                                                              |
| ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Chromium (desktop and a phone-sized window) | Tested   | The browser tests run in Chromium only (`playwright.config.ts`), some of them in a 375 by 812 window. |
| Firefox, Safari, others                     | Untested | No test runs them.                                                                                    |

Installing the app as an app, and Web Push, need HTTPS (or `localhost`). On iPhone and iPad, push
works only from the app added to the Home Screen; Settings says so. The browser tests check the
install offer, the notification settings and the server's push routes in Chromium, and unit tests
check the reminder runner. No automated test delivers a push to a real browser or phone.
