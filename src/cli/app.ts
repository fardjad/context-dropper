import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { DefaultDropperService, type DropperService } from "../dropper/service";
import type { readAndValidateFilesetEntries } from "../fileset/import-list";
import { DefaultFilesetService, type FilesetService } from "../fileset/service";
import { formatCliError, mapErrorToExitCode } from "./error-mapper";
import { createDropperCommand } from "./commands/dropper";
import { createFilesetCommand } from "./commands/fileset";
import { UsageError } from "./errors";

export type CliDependencies = {
  cwd?: string;
  filesetService?: FilesetService;
  dropperService?: DropperService;
  readAndValidateFilesetEntriesFn?: typeof readAndValidateFilesetEntries;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

export async function runCli(
  argv = process.argv,
  deps: CliDependencies = {},
): Promise<number> {
  const rawArgs = hideBin(argv);
  const parseArgs = rawArgs.length === 0 ? ["--help"] : rawArgs;
  const cwd = deps.cwd ?? process.cwd();
  const filesetService = deps.filesetService ?? new DefaultFilesetService();
  const dropperService = deps.dropperService ?? new DefaultDropperService();
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    await yargs(parseArgs)
      .scriptName("context-eyedropper")
      .usage("$0 [--data-dir <path>] <cmd> [args]")
      .option("data-dir", {
        type: "string",
        global: true,
        default: path.resolve(cwd, ".context-eyedropper"),
        describe: "Directory for tool data files",
      })
      .command(
        createFilesetCommand({
          cwd,
          filesetService,
          readAndValidateFilesetEntriesFn: deps.readAndValidateFilesetEntriesFn,
          stdout,
        }),
      )
      .command(createDropperCommand({ cwd, dropperService, stdout }))
      .completion("completion", "Generate shell completion script")
      .demandCommand(1, "You need at least one command before moving on")
      .strictCommands()
      .strictOptions()
      .exitProcess(false)
      .fail((message, error) => {
        if (error) {
          throw error;
        }

        throw new UsageError(message ?? "Invalid command usage");
      })
      .help()
      .alias("h", "help")
      .parseAsync(parseArgs, {}, (_err, _argv, output) => {
        if (output.length === 0) {
          return;
        }

        stdout.write(output);
        if (!output.endsWith("\n")) {
          stdout.write("\n");
        }
      });

    return 0;
  } catch (error) {
    stderr.write(`${formatCliError(error)}\n`);
    return mapErrorToExitCode(error);
  }
}
