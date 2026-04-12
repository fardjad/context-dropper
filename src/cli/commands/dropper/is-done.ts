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
    describe: "Check whether the dropper pointer has reached the end",
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
      deps.stdout.write(`${done}\n`);
    },
  };
}
