import { Query, QueryConstructor, QueryHandler, QueryResult } from "./types.ts"

export class QueryBus {
  private handlers = new Map<
    QueryConstructor<Query<unknown, unknown>>,
    QueryHandler<Query<unknown, unknown>>
  >()

  register<T extends Query<unknown, unknown>>(
    queryClass: QueryConstructor<T>,
    handler: QueryHandler<T>,
  ): void {
    this.handlers.set(
      queryClass,
      handler as QueryHandler<Query<unknown, unknown>>,
    )
  }

  async execute<T extends Query<unknown, unknown>>(
    query: T,
  ): Promise<QueryResult<T>> {
    const QueryClass = query.constructor as QueryConstructor<T>
    const handler = this.handlers.get(QueryClass)
    if (!handler) {
      throw new Error(`No handler for query: ${QueryClass.name}`)
    }
    return await handler(query) as QueryResult<T>
  }
}
