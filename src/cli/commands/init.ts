import type { CommandModule } from "yargs";
import { asNonEmptyString } from "../../file-utils/validation";
import type { InitService } from "../init/service";

export type InitCommandDeps = {
  cwd: string;
  initService: InitService;
  stdout: NodeJS.WritableStream;
};

export function createInitCommand(deps: InitCommandDeps): CommandModule {
  return {
    command: "init <target>",
    describe: "Generate environment-specific scaffolding",
    builder: (yargs) => {
      return yargs
        .positional("target", {
          type: "string",
          choices: deps.initService.listTargets(),
          demandOption: true,
          describe: "Scaffold output target",
        })
        .option("worker-model", {
          type: "string",
          describe: "Model override for generated worker agents",
        })
        .option("worker-reasoning-effort", {
          type: "string",
          describe: "Reasoning effort override for generated worker agents",
        });
    },
    handler: async (argv) => {
      const workerModel =
        argv["worker-model"] === undefined
          ? undefined
          : asNonEmptyString(argv["worker-model"], "--worker-model");
      const workerReasoningEffort =
        argv["worker-reasoning-effort"] === undefined
          ? undefined
          : asNonEmptyString(
              argv["worker-reasoning-effort"],
              "--worker-reasoning-effort",
            );

      const result = await deps.initService.init({
        cwd: deps.cwd,
        target: argv.target as "codex" | "opencode",
        workerModel,
        workerReasoningEffort,
      });

      deps.stdout.write(`Initialized ${result.target} scaffold in ${deps.cwd}\n`);
      for (const filePath of result.writtenFiles) {
        deps.stdout.write(`${filePath}\n`);
      }
    },
  };
}
