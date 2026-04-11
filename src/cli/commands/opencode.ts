import type { CommandModule } from "yargs";
import type { OpenCodeScaffoldService } from "../opencode/service";
import { createOpenCodeInitCommand } from "./opencode/init";

export type OpenCodeCommandDeps = {
  cwd: string;
  openCodeScaffoldService: OpenCodeScaffoldService;
  stdout: NodeJS.WritableStream;
};

export function createOpenCodeCommand(
  deps: OpenCodeCommandDeps,
): CommandModule {
  let showHelp: (() => void) | undefined;

  return {
    command: "opencode",
    describe: "Generate project-local OpenCode scaffolding",
    builder: (yargs) => {
      showHelp = () => yargs.showHelp();

      return yargs.command(createOpenCodeInitCommand(deps)).strictCommands();
    },
    handler: () => {
      showHelp?.();
    },
  };
}
