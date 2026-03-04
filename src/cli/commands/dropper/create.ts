import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperCreateCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "create <dropperName>",
    describe: "Create a dropper from a fileset",
    builder: (yargs) => {
      return yargs
        .option("fileset", {
          type: "string",
          demandOption: true,
          describe: "Name of the fileset to initialize from",
        })
        .positional("dropperName", {
          type: "string",
          demandOption: true,
          describe: "Dropper name",
        });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const filesetName = asNonEmptyString(argv.fileset, "--fileset");
      validatePortableName(filesetName, "fileset");

      const dropperName = asNonEmptyString(argv.dropperName, "<dropperName>");
      validatePortableName(dropperName, "dropper");

      await deps.dropperService.create({
        dataDir: context.dataDir,
        filesetName,
        dropperName,
      });
    },
  };
}
