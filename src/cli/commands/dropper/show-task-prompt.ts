import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { DropperCommandDeps } from "../dropper";

export function createDropperShowTaskPromptCommand(
  deps: DropperCommandDeps,
): CommandModule {
  return {
    command: "show-task-prompt <dropperName>",
    describe: "Generate the worker prompt for the active file in a dropper",
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

      const prompt = await deps.dropperService.showTaskPrompt({
        dataDir: context.dataDir,
        dropperName,
      });

      deps.stdout.write(prompt);
    },
  };
}
