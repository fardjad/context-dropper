import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperCurrentCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "current <dropperName>",
    aliases: ["info"],
    describe: "Show compact current dropper state",
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

      const state = await deps.dropperService.current({
        dataDir: context.dataDir,
        dropperName,
      });

      deps.stdout.write(`${JSON.stringify(state)}\n`);
    },
  };
}
