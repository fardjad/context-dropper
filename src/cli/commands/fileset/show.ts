import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { FilesetCommandDeps } from "../fileset";

export function createFilesetShowCommand(
  deps: FilesetCommandDeps,
): CommandModule {
  return {
    command: "show <name>",
    aliases: ["view"],
    describe: "Show files in a fileset",
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

      const fileset = await deps.filesetService.show({
        dataDir: context.dataDir,
        name,
      });

      for (const filePath of fileset.files) {
        deps.stdout.write(`${filePath}\n`);
      }
    },
  };
}
