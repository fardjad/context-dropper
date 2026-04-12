import type { CommandModule } from "yargs";
import type { DropperService } from "../../dropper/service";
import { createDropperCreateCommand } from "./dropper/create";
import { createDropperIsDoneCommand } from "./dropper/is-done";
import { createDropperListCommand } from "./dropper/list";
import { createDropperListFilesCommand } from "./dropper/list-files";
import { createDropperNextCommand } from "./dropper/next";
import { createDropperPreviousCommand } from "./dropper/previous";
import { createDropperRemoveCommand } from "./dropper/remove";
import { createDropperShowTaskPromptCommand } from "./dropper/show-task-prompt";

export type DropperCommandDeps = {
  cwd: string;
  dropperService: DropperService;
  stdout: NodeJS.WritableStream;
};

export function createDropperCommand(deps: DropperCommandDeps): CommandModule {
  let showHelp: (() => void) | undefined;

  return {
    command: "dropper",
    describe: "Manage droppers",
    builder: (yargs) => {
      showHelp = () => yargs.showHelp();

      return yargs
        .command(createDropperCreateCommand(deps))
        .command(createDropperShowTaskPromptCommand(deps))
        .command(createDropperNextCommand(deps))
        .command(createDropperPreviousCommand(deps))
        .command(createDropperIsDoneCommand(deps))
        .command(createDropperListCommand(deps))
        .command(createDropperListFilesCommand(deps))
        .command(createDropperRemoveCommand(deps))
        .strictCommands();
    },
    handler: () => {
      showHelp?.();
    },
  };
}
