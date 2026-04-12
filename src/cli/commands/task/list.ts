import type { CommandModule } from "yargs";
import { createCliContext } from "../../context";
import type { TaskCommandDeps } from "../task";

export function createTaskListCommand(deps: TaskCommandDeps): CommandModule {
  return {
    command: "list",
    aliases: ["ls"],
    describe: "List stored tasks",
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const tasks = await deps.taskService.list({ dataDir: context.dataDir });
      for (const task of tasks) {
        deps.stdout.write(`${task.name}\n`);
      }
    },
  };
}
