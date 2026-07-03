// Shared iCalendar parsing + building utilities
// Used by both Radicale and Stalwart adapters

import type { TodoItem, TodoStatus, TodoUpdate } from "@shared/types"

export function extractProp(block: string, name: string): string | null {
  const regex = new RegExp(`^${name}(?:;[^:]*)?:(.*(?:\\r?\\n .*)*)`, "m")
  const match = regex.exec(block)
  if (!match) return null
  let value = match[1].replace(/\r?\n /g, "")
  value = value.replace(/\\n/g, "\n").replace(/\\N/g, "\n")
    .replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
  return value.trim()
}

export function extractXml(xml: string, tag: string): string | null {
  const tagName = tag.includes(":") ? tag.split(":")[1] : tag
  const regex = new RegExp(
    `<(?:[^:]*:)?${tagName}[^>]*>([\\s\\S]*?)<\/(?:[^:]*:)?${tagName}>`,
  )
  const match = regex.exec(xml)
  return match ? match[1].trim() : null
}

export function extractUidFromHref(href: string | null): string | null {
  if (!href) return null
  const match = href.match(/\/([^/]+)\.ics$/)
  return match ? match[1] : null
}

export function parseStatus(status: string | null): TodoStatus {
  switch (status?.toUpperCase()) {
    case "IN-PROCESS":
      return 2 as TodoStatus
    case "COMPLETED":
      return 3 as TodoStatus
    case "CANCELLED":
      return 4 as TodoStatus
    default:
      return 1 as TodoStatus
  }
}

export function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  try {
    const parsed = dateStr
      .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6")
      .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
    return new Date(parsed)
  } catch {
    return null
  }
}

export function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;")
    .replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

export function formatStatus(status: TodoStatus): string {
  switch (status) {
    case 2:
      return "IN-PROCESS"
    case 3:
      return "COMPLETED"
    case 4:
      return "CANCELLED"
    default:
      return "NEEDS-ACTION"
  }
}

export function formatDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

export function parseSingleTodo(
  icalData: string,
  uid: string,
  etag: string,
  serverId: number,
  collectionHref: string,
  href: string,
): TodoItem | null {
  const vtodoMatch = icalData.match(/BEGIN:VTODO\s*\n([\s\S]*?)END:VTODO/)
  if (!vtodoMatch) return null
  const block = vtodoMatch[1]
  const bodyUid = extractProp(block, "UID") || uid
  return {
    uid: bodyUid,
    summary: extractProp(block, "SUMMARY") || "Untitled",
    description: extractProp(block, "DESCRIPTION") || "",
    status: parseStatus(extractProp(block, "STATUS")),
    priority: parseInt(extractProp(block, "PRIORITY") || "0") || 0,
    due: parseDate(extractProp(block, "DUE")),
    completed: parseDate(extractProp(block, "COMPLETED")),
    categories: extractProp(block, "CATEGORIES")?.split(",").map((s) => s.trim()).filter(Boolean) ||
      [],
    location: extractProp(block, "LOCATION") || "",
    rrule: extractProp(block, "RRULE") || "",
    percent: parseInt(extractProp(block, "PERCENT-COMPLETE") || "0") || 0,
    etag,
    rawIcal: `BEGIN:VTODO\n${block}END:VTODO`,
    serverId,
    collectionHref,
    href,
  }
}

export function buildVtodoContent(
  uid: string,
  summary: string,
  description: string,
  status: TodoStatus,
  priority: number,
  due: string | null,
  completed: string | null,
  categories: string[],
  location: string,
  rrule: string,
  percent: number,
  startDate?: string | null,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TodoApp//EN",
    "BEGIN:VTODO",
    `UID:${uid}`,
    `DTSTAMP:${formatDate(new Date())}`,
    `CREATED:${formatDate(new Date())}`,
    `SUMMARY:${escapeIcal(summary)}`,
    description ? `DESCRIPTION:${escapeIcal(description)}` : null,
    `STATUS:${formatStatus(status)}`,
    priority > 0 ? `PRIORITY:${priority}` : null,
    due ? `DUE:${formatDate(new Date(due))}` : null,
    completed ? `COMPLETED:${formatDate(new Date(completed))}` : null,
    startDate ? `DTSTART:${formatDate(new Date(startDate))}` : null,
    categories.length ? `CATEGORIES:${categories.join(",")}` : null,
    location ? `LOCATION:${escapeIcal(location)}` : null,
    rrule ? `RRULE:${rrule}` : null,
    percent > 0 ? `PERCENT-COMPLETE:${percent}` : null,
    "END:VTODO",
    "END:VCALENDAR",
  ].filter(Boolean) as string[]
  return lines.join("\r\n")
}

export function buildVtodoFromUpdate(uid: string, data: TodoUpdate): string {
  return buildVtodoContent(
    uid,
    data.summary || "Untitled",
    data.description || "",
    data.status ?? 1,
    data.priority ?? 0,
    data.due ?? null,
    data.completed ?? null,
    data.categories || [],
    data.location || "",
    data.rrule || "",
    data.percent ?? 0,
    data.startDate ?? null,
  )
}

export function buildNewVtodo(
  summary: string,
  description?: string,
  status?: TodoStatus,
  priority?: number,
  due?: string | null,
  categories?: string[],
  location?: string,
  rrule?: string,
  startDate?: string | null,
): string {
  return buildVtodoContent(
    crypto.randomUUID(),
    summary,
    description || "",
    status ?? 1,
    priority ?? 0,
    due ?? null,
    null,
    categories || [],
    location || "",
    rrule || "",
    0,
    startDate ?? null,
  )
}

export function parseMultistatus(xml: string): { hrefs: string[]; etagMap: Map<string, string> } {
  const hrefs: string[] = []
  const etagMap = new Map<string, string>()
  const responseRegex = /<(?:d:)?response>([\s\S]*?)<\/(?:d:)?response>/g
  let match: RegExpExecArray | null
  while ((match = responseRegex.exec(xml)) !== null) {
    const response = match[1]
    const href = extractXml(response, "d:href") || extractXml(response, "href")
    if (href) hrefs.push(href)
    const etag = extractXml(response, "d:getetag") || extractXml(response, "getetag")
    const uid = extractUidFromHref(href)
    if (uid && etag) etagMap.set(uid, etag)
  }
  return { hrefs, etagMap }
}

export function parseCalendars(
  xml: string,
): { href: string; displayName: string; color?: string }[] {
  const calendars: { href: string; displayName: string; color?: string }[] = []
  const responseRegex = /<(?:d:)?response>([\s\S]*?)<\/(?:d:)?response>/g
  let match: RegExpExecArray | null
  while ((match = responseRegex.exec(xml)) !== null) {
    const response = match[1]
    const href = extractXml(response, "d:href") || extractXml(response, "href")
    if (!href) continue
    if (!response.includes("calendar")) continue
    const compXml = extractXml(response, "c:supported-calendar-component-set") ||
      extractXml(response, "supported-calendar-component-set")
    if (compXml) {
      const hasVtodo = /<(?:[^:]*:)?comp\s+name="VTODO"/.test(compXml)
      if (!hasVtodo) continue
    }
    const displayName = extractXml(response, "d:displayname") ||
      extractXml(response, "displayname") ||
      href.split("/").filter(Boolean).pop() || href
    const color = extractXml(response, "ICAL:calendar-color") ||
      extractXml(response, "calendar-color") || ""
    calendars.push({ href, displayName, color })
  }
  return calendars
}

export function authHeader(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`)
}
