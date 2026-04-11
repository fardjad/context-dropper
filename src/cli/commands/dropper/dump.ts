import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperDumpCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "dump <dropperName>",
    describe: "Dump the full dropper contents",
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

      const record = await deps.dropperService.dump({
        dataDir: context.dataDir,
        dropperName,
      });

      deps.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    },
  };
}
