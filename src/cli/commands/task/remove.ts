import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { TaskCommandDeps } from "../task";

export function createTaskRemoveCommand(deps: TaskCommandDeps): CommandModule {
  return {
    command: "remove <taskName>",
    aliases: ["rm", "del", "delete"],
    describe: "Remove a task",
    builder: (yargs) => {
      return yargs.positional("taskName", {
        type: "string",
        demandOption: true,
        describe: "Task name",
      });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const taskName = asNonEmptyString(argv.taskName, "<taskName>");
      validatePortableName(taskName, "task");

      await deps.taskService.remove({
        dataDir: context.dataDir,
        name: taskName,
      });
    },
  };
}
