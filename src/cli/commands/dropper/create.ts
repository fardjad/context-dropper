import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperCreateCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "create <dropperName>",
    aliases: ["new"],
    describe: "Create a dropper from a fileset",
    builder: (yargs) => {
      return yargs
        .option("fileset", {
          type: "string",
          demandOption: true,
          describe: "Name of the fileset to initialize from",
        })
        .option("task", {
          type: "string",
          demandOption: true,
          describe: "Name of the task to attach to the dropper",
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
      const taskName = asNonEmptyString(argv.task, "--task");
      validatePortableName(taskName, "task");

      const dropperName = asNonEmptyString(argv.dropperName, "<dropperName>");
      validatePortableName(dropperName, "dropper");

      await deps.dropperService.create({
        dataDir: context.dataDir,
        filesetName,
        taskName,
        dropperName,
      });
    },
  };
}
