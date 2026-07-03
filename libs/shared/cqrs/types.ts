export interface Command<TPayload, TResult> {
  data: TPayload
  readonly __resultType?: TResult
}

export interface Query<TPayload, TResult> {
  data: TPayload
  readonly __resultType?: TResult
}

export type CommandConstructor<T extends Command<unknown, unknown>> = new (...args: any[]) => T

export type QueryConstructor<T extends Query<unknown, unknown>> = new (...args: any[]) => T

export type CommandResult<T extends Command<unknown, unknown>> = T extends Command<unknown, infer R>
  ? R
  : never

export type QueryResult<T extends Query<unknown, unknown>> = T extends Query<unknown, infer R> ? R
  : never

export type CommandHandler<T extends Command<unknown, unknown>> = (
  command: T,
) => Promise<CommandResult<T>>

export type QueryHandler<T extends Query<unknown, unknown>> = (
  query: T,
) => Promise<QueryResult<T>>
