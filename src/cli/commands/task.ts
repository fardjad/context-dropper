import type { CommandModule } from "yargs";
import type { TaskService } from "../../task/service";
import { createTaskCreateCommand } from "./task/create";
import { createTaskListCommand } from "./task/list";
import { createTaskRemoveCommand } from "./task/remove";
import { createTaskShowCommand } from "./task/show";
import { createTaskUpdateCommand } from "./task/update";

export type TaskCommandDeps = {
  cwd: string;
  taskService: TaskService;
  stdout: NodeJS.WritableStream;
};

export function createTaskCommand(deps: TaskCommandDeps): CommandModule {
  let showHelp: (() => void) | undefined;

  return {
    command: "task",
    describe: "Manage markdown tasks",
    builder: (yargs) => {
      showHelp = () => yargs.showHelp();

      return yargs
        .command(createTaskCreateCommand(deps))
        .command(createTaskShowCommand(deps))
        .command(createTaskListCommand(deps))
        .command(createTaskUpdateCommand(deps))
        .command(createTaskRemoveCommand(deps))
        .strictCommands();
    },
    handler: () => {
      showHelp?.();
    },
  };
}
