import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperListCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "list",
    aliases: ["ls"],
    describe: "List all droppers, optionally filtered by fileset",
    builder: (yargs) => {
      return yargs.option("fileset", {
        type: "string",
        describe: "Filter droppers belonging to a specific fileset name",
      });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const droppers = await deps.dropperService.list({
        dataDir: context.dataDir,
        filesetName: argv.fileset as string | undefined,
      });

      for (const name of droppers) {
        deps.stdout.write(`${name}\n`);
      }
    },
  };
}
