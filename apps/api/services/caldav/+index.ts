// CalDAV adapter factory — returns the right adapter for a given server type

import type { ServerType } from "@shared/types"
import type { TodoItem, TodoUpdate } from "@shared/types"

export interface CalendarInfo {
  href: string
  displayName: string
  color?: string
}

export interface CalDAVAdapter {
  /** Discover calendars (collections) on the server */
  getCalendars(
    baseUrl: string,
    username: string,
    password: string,
    userPath: string,
  ): Promise<CalendarInfo[]>

  /** Fetch all VTODOs from a calendar */
  getTodos(
    baseUrl: string,
    username: string,
    password: string,
    calendarPath: string,
    serverId: number,
  ): Promise<TodoItem[]>

  /** Create or update a VTODO on the server */
  putTodo(
    baseUrl: string,
    username: string,
    password: string,
    calendarPath: string,
    uid: string,
    icalData: string,
    etag?: string,
    href?: string,
  ): Promise<string>

  /** Delete a VTODO from the server */
  deleteTodo(
    baseUrl: string,
    username: string,
    password: string,
    calendarPath: string,
    uid: string,
    etag?: string,
    href?: string,
  ): Promise<void>

  /** Create a new calendar collection */
  createCollection(
    baseUrl: string,
    username: string,
    password: string,
    userPath: string,
    displayName: string,
  ): Promise<string>

  /** Rename a calendar collection */
  proppatchCollection(
    baseUrl: string,
    username: string,
    password: string,
    collectionHref: string,
    displayName: string,
  ): Promise<void>

  /** Delete a calendar collection */
  deleteCollection(
    baseUrl: string,
    username: string,
    password: string,
    collectionHref: string,
  ): Promise<void>
}

import { RadicaleAdapter } from "./radicale.ts"
import { StalwartAdapter } from "./stalwart.ts"

const adapters = new Map<number, CalDAVAdapter>()

export function getAdapter(serverType: ServerType): CalDAVAdapter {
  const key = serverType as number
  let adapter = adapters.get(key)
  if (!adapter) {
    switch (serverType) {
      case 2: // STALWART
        adapter = new StalwartAdapter()
        break
      case 1: // RADICALE
      default:
        adapter = new RadicaleAdapter()
        break
    }
    adapters.set(key, adapter)
  }
  return adapter
}
