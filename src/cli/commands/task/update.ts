import { readFile } from "node:fs/promises";
import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  assertReadableFile,
  normalizeAbsolutePath,
  validatePortableName,
} from "../../../file-utils/validation";
import { createCliContext } from "../../context";
import type { TaskCommandDeps } from "../task";

export function createTaskUpdateCommand(deps: TaskCommandDeps): CommandModule {
  return {
    command: "update <taskName>",
    describe: "Replace a task with markdown from a file",
    builder: (yargs) => {
      return yargs
        .option("from", {
          type: "string",
          demandOption: true,
          describe: "Path to a markdown file",
        })
        .positional("taskName", {
          type: "string",
          demandOption: true,
          describe: "Task name",
        });
    },
    handler: async (argv) => {
      const context = createCliContext(argv, deps.cwd);
      const taskName = asNonEmptyString(argv.taskName, "<taskName>");
      validatePortableName(taskName, "task");

      const fromPath = normalizeAbsolutePath(
        asNonEmptyString(argv.from, "--from"),
        deps.cwd,
      );
      await assertReadableFile(fromPath, "--from");
      const content = await readFile(fromPath, "utf-8");

      await deps.taskService.update({
        dataDir: context.dataDir,
        name: taskName,
        content,
      });
    },
  };
}
