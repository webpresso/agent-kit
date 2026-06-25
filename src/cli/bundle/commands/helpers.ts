import type { CliCommand } from "@webpresso/cli-contract";

function notImplementedMessage(scope: string, name: string): string {
  return `${scope} bundle command "${name}" is not implemented yet.`;
}

export function getCommandRawArgs(
  context: Parameters<NonNullable<CliCommand["run"]>>[0] & {
    readonly rawArgs?: readonly string[];
  },
): readonly string[] {
  return context.rawArgs ?? [];
}

export function placeholderCommand(scope: string, name: string, description: string): CliCommand {
  return {
    meta: { description, name },
    run: () => {
      throw new Error(notImplementedMessage(scope, name));
    },
  };
}

export function placeholderGroup(
  scope: string,
  name: string,
  description: string,
  subCommands: Record<string, CliCommand>,
): CliCommand {
  return {
    meta: { description, name },
    subCommands: Object.fromEntries(
      Object.entries(subCommands).map(([subCommandName, command]) => [
        subCommandName,
        () => command,
      ]),
    ),
  };
}
