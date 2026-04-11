import type { CommandModule } from "yargs";
import { asNonEmptyString } from "../../../file-utils/validation";
import type { OpenCodeCommandDeps } from "../opencode";

export function createOpenCodeInitCommand(
  deps: OpenCodeCommandDeps,
): CommandModule {
  return {
    command: "init",
    describe: "Generate OpenCode commands, prompts, and agent config",
    builder: (yargs) => {
      return yargs
        .option("controller-model", {
          type: "string",
          describe: "Model override for the generated controller agent",
        })
        .option("worker-model", {
          type: "string",
          describe: "Model override for the generated worker agent",
        });
    },
    handler: async (argv) => {
      const controllerModel =
        argv["controller-model"] === undefined
          ? undefined
          : asNonEmptyString(argv["controller-model"], "--controller-model");
      const workerModel =
        argv["worker-model"] === undefined
          ? undefined
          : asNonEmptyString(argv["worker-model"], "--worker-model");

      const result = await deps.openCodeScaffoldService.init({
        cwd: deps.cwd,
        controllerModel,
        workerModel,
      });

      deps.stdout.write(`Initialized OpenCode scaffold in ${deps.cwd}\n`);
      for (const filePath of result.writtenFiles) {
        deps.stdout.write(`${filePath}\n`);
      }
    },
  };
}
