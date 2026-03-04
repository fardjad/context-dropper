import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperIsDoneCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "is-done <dropperName>",
    describe: "Check whether all files in a dropper have at least one tag",
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

      const done = await deps.dropperService.isDone({
        dataDir: context.dataDir,
        dropperName,
      });

      if (done) {
        deps.stdout.write("true\n");
      }
    },
  };
}
