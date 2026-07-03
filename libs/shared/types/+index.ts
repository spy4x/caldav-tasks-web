// #region Enums (start at 1 per Financy convention)
export enum UserRole {
  VIEWER = 1,
  ADMIN = 4,
}
export enum ServerType {
  RADICALE = 1,
  STALWART = 2,
}
export enum TodoStatus {
  NEEDS_ACTION = 1,
  IN_PROCESS = 2,
  COMPLETED = 3,
  CANCELLED = 4,
}

export const TODO_STATUS_LABELS: Record<number, string> = {
  1: "Needs Action",
  2: "In Progress",
  3: "Completed",
  4: "Cancelled",
}
export const TODO_STATUS_COLORS: Record<number, string> = {
  1: "text-blue-400",
  2: "text-amber-400",
  3: "text-green-400",
  4: "text-slate-500",
}
// #endregion

// #region Base
export interface BaseModel {
  id: number
  createdAt: Date
  updatedAt: Date
}
// #endregion

// #region User
export interface User extends BaseModel {
  email: string
  firstName: string
  secondName: string
  role: UserRole
  lastLoginAt: Date | null
}
export interface UserKey extends BaseModel {
  userId: number
  kind: number
  identification: string
  secret: string
}
export interface UserSession extends BaseModel {
  token: string
  userId: number
  keyId: number
  expiresAt: Date
  status: number
}
// #endregion

// #region Server
export interface ServerCredentials extends BaseModel {
  userId: number
  name: string
  serverType: ServerType
  baseUrl: string
  username: string
  password: string
  calendarPath: string | null
}
// #endregion

// #region Calendar Collection
export interface CalendarCollection {
  href: string
  displayName: string
  color: string
  serverId: number
}
// #endregion

// #region Todo
export interface TodoItem {
  uid: string
  summary: string
  description: string
  status: TodoStatus
  priority: number
  due: Date | null
  completed: Date | null
  categories: string[]
  location: string
  rrule: string
  percent: number
  etag: string
  rawIcal: string
  serverId: number
  collectionHref: string
  href: string
}
export interface TodoUpdate {
  summary?: string
  description?: string
  status?: TodoStatus
  priority?: number
  due?: string | null
  completed?: string | null
  categories?: string[]
  location?: string
  rrule?: string
  percent?: number
  startDate?: string | null
}
// #endregion
