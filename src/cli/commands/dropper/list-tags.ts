import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperListTagsCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "list-tags <dropperName>",
    describe: "List tags for the current item in a dropper",
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

      const tags = await deps.dropperService.listTags({
        dataDir: context.dataDir,
        dropperName,
      });

      for (const tag of tags) {
        deps.stdout.write(`${tag}\n`);
      }
    },
  };
}
