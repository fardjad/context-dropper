import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperPreviousCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "previous <dropperName>",
    describe: "Move the dropper pointer to the previous item",
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

      await deps.dropperService.previous({
        dataDir: context.dataDir,
        dropperName,
      });
    },
  };
}
