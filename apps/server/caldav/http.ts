import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { type Type, type } from "arktype"
import { readJsonBody } from "@spy4x/server/http/bounded-body"
import { ApiErrorCode } from "@api/errors.ts"
import { CALDAV_MAX_REQUEST_BYTES } from "@api/caldav.ts"
import type { CalDavFailure } from "./errors.ts"

/** The statuses a refusal of the request itself uses. */
type RefusalStatus = 400 | 408 | 413 | 415

/** What a request body over {@link CALDAV_MAX_REQUEST_BYTES} answers: this server refused it. */
export const REQUEST_TOO_LARGE = "The request is larger than this server accepts"

/** Reads and checks a JSON body under {@link CALDAV_MAX_REQUEST_BYTES}, or answers the refusal. */
export async function readRequest<T>(c: Context, schema: Type<T>): Promise<T | Response> {
  const contentType = c.req.header("content-type") ?? ""
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return refuse(c, 415, "Send the request as JSON")
  }
  let body: unknown
  try {
    body = await readJsonBody(c, { maxBytes: CALDAV_MAX_REQUEST_BYTES })
  } catch (error) {
    if (!(error instanceof HTTPException)) throw error
    // readJsonBody throws only 400, 408 and 413, each with a message that holds no body.
    if (error.status === 413) {
      return c.json({ code: ApiErrorCode.TooLarge, message: REQUEST_TOO_LARGE }, 413)
    }
    return refuse(c, error.status as RefusalStatus, error.message)
  }
  const request = schema(body)
  if (request instanceof type.errors) return refuse(c, 400, "The request is not valid")
  return request as T
}

export function refuse(c: Context, status: RefusalStatus, message: string): Response {
  return c.json({ code: ApiErrorCode.BadRequest, message }, status)
}

export function outside(c: Context): Response {
  return refuse(c, 400, "Not a task list or task this server lists")
}

export function failed(c: Context, failure: CalDavFailure): Response {
  return c.json({ code: failure.code, message: failure.message }, failure.status)
}
