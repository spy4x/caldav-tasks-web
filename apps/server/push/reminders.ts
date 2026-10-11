import { type CalDavClient, CalDavErrorCode, type CalDavResult } from "@spy4x/caldav"
import type { WebPushSender } from "@spy4x/integrations/push"
import { createReminderNotify } from "@spy4x/integrations/push-reminders"
import {
  createReminderRunner,
  type ReminderRunner,
  type ReminderRunnerOptions,
} from "@spy4x/platform/server/reminder-runner"
import { taskPath } from "@api/push.ts"
import { holdsTasks } from "../caldav/routes.ts"

/** The one person an install serves: every subscription and every reminder is the owner's. */
export const OWNER = "owner"

/**
 * When a reminder fires for a task that has a date and no time, such as Tasks.org's default
 * "when due" reminder on a task due "on the 12th": nine in the morning of that day, not midnight.
 */
export const DATE_ONLY_REMINDER_TIME = "09:00"

/** Why the tasks could not be read. The text holds an operation and a code, nothing of a task. */
export class ReminderReadError extends Error {
  /** The name of the CalDAV error code, such as `Forbidden`. */
  readonly code: string
  constructor(operation: string, code: CalDavErrorCode) {
    super(`${operation} failed: ${CalDavErrorCode[code]}`)
    this.name = "ReminderReadError"
    this.code = CalDavErrorCode[code]
  }
}

/** Failures that pass by themselves: the whole read is tried again, so a late list loses nothing. */
const PASSING: ReadonlySet<string> = new Set([
  CalDavErrorCode[CalDavErrorCode.Timeout],
  CalDavErrorCode[CalDavErrorCode.Network],
  CalDavErrorCode[CalDavErrorCode.Server],
])

/** What {@link createReminders} needs. */
export interface RemindersOptions {
  /** The CalDAV account the relay uses. Only read here. */
  client: Pick<CalDavClient, "discover" | "listCalendars" | "listObjects">
  /** Pushes to the owner's devices and removes a subscription its push service says is gone. */
  sender: Pick<WebPushSender, "send">
  /** Where the runner keeps "last run" and "already sent". */
  state: ReminderRunnerOptions["state"]
  /** The zone of a date with no time and of a time with no zone. */
  zone: string
  /** One short line per failure. Defaults to `console.error`. */
  log?: (line: string) => void
  /** Test seams. */
  clock?: ReminderRunnerOptions["clock"]
  timers?: ReminderRunnerOptions["timers"]
}

/**
 * The text of every open task in every list that can hold tasks: the calendars the relay lists
 * (`holdsTasks`), read fresh. Completed tasks are left out by the CalDAV server. It only reads.
 *
 * A list that stays unreadable (forbidden, gone, too large, malformed) while another can be read
 * is left out, so one broken list never silences the rest: `log` gets one line with how many were
 * left out and the error codes, never a list's name or address.
 *
 * @throws {ReminderReadError} when the account, a home or every list cannot be read, or a list
 * fails in a way that passes by itself (a timeout, the network, a server error); nothing is sent
 * for that tick and the runner tries the same stretch of time again, so no reminder is lost.
 */
export function createTaskReader(
  client: RemindersOptions["client"],
  log: (line: string) => void,
): () => Promise<string[]> {
  let homes: string[] | undefined
  async function read<T>(operation: string, run: () => Promise<CalDavResult<T>>): Promise<T> {
    const result = await run()
    if (!result.success) throw new ReminderReadError(operation, result.error.code)
    return result.output
  }
  return async () => {
    // Discovery is kept once it succeeds, as the relay keeps it.
    homes ??= (await read("discover", () => client.discover())).homeUrls
    const texts: string[] = []
    const failed: ReminderReadError[] = []
    let lists = 0
    for (const home of homes) {
      const calendars = await read("listCalendars", () => client.listCalendars(home))
      for (const calendar of calendars.filter(holdsTasks)) {
        lists++
        try {
          const objects = await read(
            "listObjects",
            () => client.listObjects(calendar.url, { component: "VTODO", includeCompleted: false }),
          )
          for (const object of objects) texts.push(object.data)
        } catch (error) {
          if (!(error instanceof ReminderReadError) || PASSING.has(error.code)) throw error
          failed.push(error)
        }
      }
    }
    if (failed.length === 0) return texts
    if (failed.length === lists) throw failed[0]
    const codes = [...new Set(failed.map((error) => error.code))].join(", ")
    log(`reminders: ${failed.length} of ${lists} task lists could not be read: ${codes}`)
    return texts
  }
}

/** The class name of whatever was thrown: enough to find a bug, and never a task or an address. */
export function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/**
 * The reminder runner of this install. Once a minute it reads the owner's open tasks over CalDAV
 * and pushes each reminder that came due to every subscribed device, once. The notification's title
 * is the task's summary, a tap opens that task's editor, and its tag is derived from the reminder's
 * key, so the same reminder never stacks.
 *
 * A failure is logged as one line with the step and the error's class; the text of a task, an
 * endpoint, a key and a push service's answer never reach the log.
 */
export function createReminders(options: RemindersOptions): ReminderRunner {
  const log = options.log ?? ((line: string) => console.error(line))
  const base = {
    sender: options.sender,
    userId: OWNER,
    // "1 of 2 devices did not get a reminder: HTTP 403 (1)": a count and a status, built by the
    // library from nothing else.
    onDeviceFailure: (error: Error) => log(`reminders: ${error.message}`),
  }
  const home = createReminderNotify({ ...base, url: "/" })
  return createReminderRunner({
    listTasks: createTaskReader(options.client, log),
    notify: (reminder) => {
      let notify = home
      try {
        notify = createReminderNotify({ ...base, url: taskPath(reminder.uid) })
      } catch (error) {
        // A UID too long to fit in a push: the notification still shows, and opens the app.
        if (!(error instanceof RangeError)) throw error
      }
      return notify(reminder)
    },
    state: options.state,
    zone: options.zone,
    dateOnlyTime: DATE_ONLY_REMINDER_TIME,
    onError: (error, step) => {
      const detail = error instanceof ReminderReadError ? error.message : nameOf(error)
      log(`reminders: ${step} failed: ${detail}`)
    },
    clock: options.clock,
    timers: options.timers,
  })
}
