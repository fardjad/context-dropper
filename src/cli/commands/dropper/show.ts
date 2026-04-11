import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperShowCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "show <dropperName>",
    aliases: ["view"],
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

      const content = await deps.dropperService.show({
        dataDir: context.dataDir,
        dropperName,
      });

      deps.stdout.write(content);
      if (!content.endsWith("\n")) {
        deps.stdout.write("\n");
      }
    },
  };
}
