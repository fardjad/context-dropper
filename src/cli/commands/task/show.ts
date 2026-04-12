import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { TaskCommandDeps } from "../task";

export function createTaskShowCommand(deps: TaskCommandDeps): CommandModule {
  return {
    command: "show <taskName>",
    aliases: ["view"],
    describe: "Show markdown task contents",
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

      const task = await deps.taskService.show({
        dataDir: context.dataDir,
        name: taskName,
      });

      deps.stdout.write(task.content);
    },
  };
}
