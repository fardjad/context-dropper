import type { CommandModule } from "yargs";
import { AppError } from "../../../file-utils/errors";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperListFilesCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "list-files <dropperName>",
    aliases: ["ls-files"],
    describe: "List files in a dropper filtered by done status",
    builder: (yargs) => {
      return yargs
        .option("done", {
          type: "boolean",
          default: false,
          describe: "List only files before the current pointer",
        })
        .option("pending", {
          type: "boolean",
          default: false,
          describe: "List only the current file and files after it",
        })
        .option("all", {
          type: "boolean",
          default: false,
          describe: "List all files regardless of pointer position",
        })
        .positional("dropperName", {
          type: "string",
          demandOption: true,
          describe: "Dropper name",
        });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const dropperName = asNonEmptyString(argv.dropperName, "<dropperName>");
      validatePortableName(dropperName, "dropper");

      const selectedStatuses = [argv.done, argv.pending, argv.all].filter(
        (value) => value === true,
      ).length;
      if (selectedStatuses > 1) {
        throw new AppError("Use only one of --done, --pending, or --all");
      }

      const status =
        argv.done === true ? "done" : argv.pending === true ? "pending" : "all";

      const files = await deps.dropperService.listFiles({
        dataDir: context.dataDir,
        dropperName,
        status,
      });

      for (const filePath of files) {
        deps.stdout.write(`${filePath}\n`);
      }
    },
  };
}
