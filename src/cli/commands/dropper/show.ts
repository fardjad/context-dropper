import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperShowCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "show <dropperName>",
    describe: "Show the current file content in the dropper",
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

      await deps.dropperService.show({
        dataDir: context.dataDir,
        dropperName,
      });
    },
  };
}
