import type { User, UserKey, UserSession } from "@shared/types"

export interface AuthData {
  user: User
  key: UserKey
  session: UserSession
}

export interface APIContext {
  Variables: {
    auth?: AuthData
    requestId: string
  }
}
