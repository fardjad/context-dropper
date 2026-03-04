import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import type { FilesetCommandDeps } from "../fileset";

export function createFilesetListCommand(
  deps: FilesetCommandDeps,
): CommandModule {
  return {
    command: "list",
    describe: "List available filesets",
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      await deps.filesetService.list({ dataDir: context.dataDir });
    },
  };
}
