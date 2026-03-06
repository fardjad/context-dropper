import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { FilesetCommandDeps } from "../fileset";

export function createFilesetRemoveCommand(
  deps: FilesetCommandDeps,
): CommandModule {
  return {
    command: "remove <name>",
    aliases: ["rm", "del", "delete"],
    describe: "Remove a fileset",
    builder: (yargs) => {
      return yargs.positional("name", {
        type: "string",
        demandOption: true,
        describe: "Fileset name",
      });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const name = asNonEmptyString(argv.name, "<name>");
      validatePortableName(name, "fileset");

      await deps.filesetService.remove({
        dataDir: context.dataDir,
        name,
      });
    },
  };
}
