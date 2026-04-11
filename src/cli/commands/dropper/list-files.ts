import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  normalizeAbsolutePath,
  normalizeTagList,
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
    describe: "List files in a dropper with optional filters",
    builder: (yargs) => {
      return yargs
        .option("tag", {
          type: "string",
          array: true,
          describe: "Filter by tag. Repeat --tag for OR semantics.",
        })
        .option("filename", {
          type: "string",
          describe: "Filter by an exact normalized absolute file path",
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

      const tags =
        argv.tag === undefined
          ? undefined
          : normalizeTagList(argv.tag, "--tag");
      const filename =
        argv.filename === undefined
          ? undefined
          : normalizeAbsolutePath(
              asNonEmptyString(argv.filename, "--filename"),
              deps.cwd,
            );

      const entries = await deps.dropperService.listFiles({
        dataDir: context.dataDir,
        dropperName,
        tags,
        filename,
      });

      for (const entry of entries) {
        deps.stdout.write(`${entry.path}\n`);
      }
    },
  };
}
