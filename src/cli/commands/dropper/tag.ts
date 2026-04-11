import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  normalizeTagList,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperTagCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "tag <dropperName>",
    describe: "Add tag(s) to the current item in a dropper",
    builder: (yargs) => {
      return yargs
        .option("tag", {
          type: "string",
          array: true,
          demandOption: true,
          describe: "Tag to add. Repeat --tag to add multiple tags.",
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

      const tags = normalizeTagList(argv.tag, "--tag");
      await deps.dropperService.tag({
        dataDir: context.dataDir,
        dropperName,
        tags,
      });
    },
  };
}
