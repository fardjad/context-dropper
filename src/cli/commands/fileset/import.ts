import type { CommandModule } from "yargs";
import {
  asNonEmptyString,
  normalizeAbsolutePath,
  validatePortableName,
} from "../../../file-utils/validation";
import { readAndValidateFilesetEntries } from "../../../fileset/import-list";
import { createCliContext } from "../../context";
import type { FilesetCommandDeps } from "../fileset";

export function createFilesetImportCommand(
  deps: FilesetCommandDeps,
): CommandModule {
  return {
    command: "import <listFilePath>",
    describe: "Validate and import a fileset list file",
    builder: (yargs) => {
      return yargs
        .option("name", {
          type: "string",
          demandOption: true,
          describe: "Name to assign to the imported fileset",
        })
        .positional("listFilePath", {
          type: "string",
          demandOption: true,
          describe: "Path to a text file with one file path per line",
        });
    },
    handler: async (argv) => {
      const readAndValidateFilesetEntriesFn =
        deps.readAndValidateFilesetEntriesFn ?? readAndValidateFilesetEntries;
      const context = createCliContext(argv, deps.cwd);
      const name = asNonEmptyString(argv.name, "--name");
      validatePortableName(name, "fileset");

      const inputListPath = asNonEmptyString(
        argv.listFilePath,
        "<listFilePath>",
      );
      const listFilePath = normalizeAbsolutePath(inputListPath, deps.cwd);
      const normalizedFilePaths =
        await readAndValidateFilesetEntriesFn(listFilePath);

      await deps.filesetService.importFromList({
        dataDir: context.dataDir,
        name,
        listFilePath,
        normalizedFilePaths,
      });
    },
  };
}
