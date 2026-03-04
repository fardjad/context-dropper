import type { CommandModule } from "yargs";
import type { DropperService } from "../../dropper/service";
import { createDropperCreateCommand } from "./dropper/create";
import { createDropperDumpCommand } from "./dropper/dump";
import { createDropperListCommand } from "./dropper/list";
import { createDropperListTagsCommand } from "./dropper/list-tags";
import { createDropperNextCommand } from "./dropper/next";
import { createDropperPreviousCommand } from "./dropper/previous";
import { createDropperRemoveCommand } from "./dropper/rm";
import { createDropperRemoveTagCommand } from "./dropper/rm-tag";
import { createDropperShowCommand } from "./dropper/show";
import { createDropperTagCommand } from "./dropper/tag";

export type DropperCommandDeps = {
  cwd: string;
  dropperService: DropperService;
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
        .command(createDropperShowCommand(deps))
        .command(createDropperNextCommand(deps))
        .command(createDropperPreviousCommand(deps))
        .command(createDropperTagCommand(deps))
        .command(createDropperListTagsCommand(deps))
        .command(createDropperRemoveTagCommand(deps))
        .command(createDropperListCommand(deps))
        .command(createDropperRemoveCommand(deps))
        .command(createDropperDumpCommand(deps))
        .strictCommands();
    },
    handler: () => {
      showHelp?.();
    },
  };
}
