import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import {
  asNonEmptyString,
  normalizeTagList,
  validatePortableName,
} from "../../../file-utils/validation";
import type { DropperCommandDeps } from "../dropper";

export function createDropperRemoveTagCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "rm-tag <dropperName>",
    describe: "Remove tag(s) from the current item in a dropper",
    builder: (yargs) => {
      return yargs
        .option("tag", {
          type: "string",
          array: true,
          demandOption: true,
          describe: "Tag to remove. Repeat --tag to remove multiple tags.",
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
      await deps.dropperService.removeTags({
        dataDir: context.dataDir,
        dropperName,
        tags,
      });
    },
  };
}
