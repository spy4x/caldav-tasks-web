import { Command, CommandConstructor, CommandHandler, CommandResult } from "./types.ts"

export class CommandBus {
  private handlers = new Map<
    CommandConstructor<Command<unknown, unknown>>,
    CommandHandler<Command<unknown, unknown>>
  >()

  register<T extends Command<unknown, unknown>>(
    commandClass: CommandConstructor<T>,
    handler: CommandHandler<T>,
  ): void {
    this.handlers.set(
      commandClass,
      handler as CommandHandler<Command<unknown, unknown>>,
    )
  }

  async execute<T extends Command<unknown, unknown>>(
    command: T,
  ): Promise<CommandResult<T>> {
    const CommandClass = command.constructor as CommandConstructor<T>
    const handler = this.handlers.get(CommandClass)
    if (!handler) {
      throw new Error(`No handler for command: ${CommandClass.name}`)
    }
    return await handler(command) as CommandResult<T>
  }
}
