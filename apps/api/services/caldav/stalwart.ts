// Stalwart CalDAV adapter
// Stalwart serves CalDAV under /dav/cal/<userId>/ with standard XML namespace.
// Supports the same CalDAV operations but paths are under /dav/cal/<email>/.

import type { TodoItem } from "@shared/types"
import type { CalDAVAdapter, CalendarInfo } from "./+index.ts"
import {
  authHeader,
  extractUidFromHref,
  parseCalendars,
  parseMultistatus,
  parseSingleTodo,
} from "./parse.ts"

export class StalwartAdapter implements CalDAVAdapter {
  async getCalendars(
    baseUrl: string,
    username: string,
    password: string,
    userPath: string,
  ): Promise<CalendarInfo[]> {
    const url = `${baseUrl.replace(/\/$/, "")}${userPath}`
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/">
<d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><ICAL:calendar-color/></d:prop>
</d:propfind>`
    const res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader(username, password),
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body,
    })
    if (!res.ok) throw new Error(`CalDAV calendar discovery failed: ${res.status}`)
    return parseCalendars(await res.text())
  }

  async getTodos(
    baseUrl: string,
    username: string,
    password: string,
    calendarPath: string,
    serverId: number,
  ): Promise<TodoItem[]> {
    const base = baseUrl.replace(/\/$/, "")
    const auth = authHeader(username, password)

    const listUrl = `${base}${calendarPath}`
    const listBody = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>`
    const res = await fetch(listUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: auth,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: listBody,
    })
    if (!res.ok) throw new Error(`CalDAV PROPFIND failed: ${res.status}`)
    const text = await res.text()
    const { hrefs } = parseMultistatus(text)
    const icsHrefs = hrefs.filter((h) => h.endsWith(".ics"))

    const todos: TodoItem[] = []
    for (const href of icsHrefs) {
      try {
        const icsUrl = `${base}${href}`
        const icsRes = await fetch(icsUrl, { headers: { Authorization: auth } })
        if (!icsRes.ok) continue
        const icalData = await icsRes.text()
        const etag = icsRes.headers.get("ETag") || ""
        const uid = extractUidFromHref(href) || ""
        if (uid && icalData.includes("VTODO")) {
          const todo = parseSingleTodo(icalData, uid, etag, serverId, calendarPath, href)
          if (todo) todos.push(todo)
        }
      } catch {
        continue
      }
    }
    return todos
  }

  async putTodo(
    baseUrl: string,
    username: string,
    password: string,
    calendarPath: string,
    uid: string,
    icalData: string,
    etag?: string,
    href?: string,
  ): Promise<string> {
    const url = href
      ? `${baseUrl.replace(/\/$/, "")}${href}`
      : `${baseUrl.replace(/\/$/, "")}${calendarPath}${uid}.ics`
    const headers: Record<string, string> = {
      Authorization: authHeader(username, password),
      "Content-Type": "text/calendar; charset=utf-8",
    }
    if (etag) headers["If-Match"] = etag
    const res = await fetch(url, { method: "PUT", headers, body: icalData })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`CalDAV PUT failed: ${res.status}${body ? ` — ${body}` : ""}`)
    }
    return res.headers.get("ETag") || ""
  }

  async deleteTodo(
    baseUrl: string,
    username: string,
    password: string,
    _calendarPath: string,
    _uid: string,
    etag?: string,
    href?: string,
  ): Promise<void> {
    const url = `${baseUrl.replace(/\/$/, "")}${href}`
    const headers: Record<string, string> = { Authorization: authHeader(username, password) }
    if (etag) headers["If-Match"] = etag
    const res = await fetch(url, { method: "DELETE", headers })
    if (!res.ok) throw new Error(`CalDAV DELETE failed: ${res.status}`)
  }

  async createCollection(
    baseUrl: string,
    username: string,
    password: string,
    userPath: string,
    displayName: string,
  ): Promise<string> {
    const base = baseUrl.replace(/\/$/, "")
    const uuid = crypto.randomUUID()
    const href = `${userPath}${uuid}/`
    const url = `${base}${href}`
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:mkcol xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
<d:set><d:prop>
<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
<d:displayname>${displayName}</d:displayname>
<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
<cs:getctag>0</cs:getctag>
</d:prop></d:set>
</d:mkcol>`
    const res = await fetch(url, {
      method: "MKCOL",
      headers: {
        Authorization: authHeader(username, password),
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
    })
    if (!res.ok) throw new Error(`CalDAV MKCOL failed: ${res.status}`)
    return href
  }

  async proppatchCollection(
    baseUrl: string,
    username: string,
    password: string,
    collectionHref: string,
    displayName: string,
  ): Promise<void> {
    const url = `${baseUrl.replace(/\/$/, "")}${collectionHref}`
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propertyupdate xmlns:d="DAV:">
<d:set><d:prop><d:displayname>${displayName}</d:displayname></d:prop></d:set>
</d:propertyupdate>`
    const res = await fetch(url, {
      method: "PROPPATCH",
      headers: {
        Authorization: authHeader(username, password),
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
    })
    if (!res.ok) throw new Error(`CalDAV PROPPATCH failed: ${res.status}`)
  }

  async deleteCollection(
    baseUrl: string,
    username: string,
    password: string,
    collectionHref: string,
  ): Promise<void> {
    const url = `${baseUrl.replace(/\/$/, "")}${collectionHref}`
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: authHeader(username, password) },
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`CalDAV DELETE collection failed: ${res.status}`)
    }
  }
}
