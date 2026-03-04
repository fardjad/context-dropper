import type { CommandModule } from "yargs";
import type { readAndValidateFilesetEntries } from "../../fileset/import-list";
import type { FilesetService } from "../../fileset/service";
import { createFilesetImportCommand } from "./fileset/import";
import { createFilesetListCommand } from "./fileset/list";
import { createFilesetRemoveCommand } from "./fileset/rm";
import { createFilesetShowCommand } from "./fileset/show";

export type FilesetCommandDeps = {
  cwd: string;
  filesetService: FilesetService;
  readAndValidateFilesetEntriesFn?: typeof readAndValidateFilesetEntries;
  stdout: NodeJS.WritableStream;
};

export function createFilesetCommand(deps: FilesetCommandDeps): CommandModule {
  let showHelp: (() => void) | undefined;

  return {
    command: "fileset",
    describe: "Manage filesets",
    builder: (yargs) => {
      showHelp = () => yargs.showHelp();

      return yargs
        .command(createFilesetImportCommand(deps))
        .command(createFilesetListCommand(deps))
        .command(createFilesetRemoveCommand(deps))
        .command(createFilesetShowCommand(deps))
        .strictCommands();
    },
    handler: () => {
      showHelp?.();
    },
  };
}
