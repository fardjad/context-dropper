import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperNextCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "next <dropperName>",
    describe: "Advance the dropper pointer to the next item",
    builder: (yargs) => {
      return yargs.positional("dropperName", {
        type: "string",
        demandOption: true,
        describe: "Dropper name",
      });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const dropperName = asNonEmptyString(argv.dropperName, "<dropperName>");
      validatePortableName(dropperName, "dropper");

      await deps.dropperService.next({
        dataDir: context.dataDir,
        dropperName,
      });
    },
  };
}
