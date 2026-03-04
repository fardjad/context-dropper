import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperRemoveCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "rm <dropperName>",
    describe: "Remove a dropper",
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

      await deps.dropperService.remove({
        dataDir: context.dataDir,
        dropperName,
      });
    },
  };
}
