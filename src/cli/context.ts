import type { ArgumentsCamelCase } from "yargs";
import { AppError } from "../file-utils/errors";
import {
  asNonEmptyString,
  normalizeAbsolutePath,
} from "../file-utils/validation";

export type CliContext = {
  dataDir: string;
};

export function createCliContext(
  argv: ArgumentsCamelCase,
  cwd: string,
): CliContext {
  const rawDataDir = argv["data-dir"] ?? argv.dataDir;

  if (rawDataDir === undefined) {
    throw new AppError("Missing --data-dir option");
  }

  const dataDirInput = asNonEmptyString(rawDataDir, "--data-dir");
  return {
    dataDir: normalizeAbsolutePath(dataDirInput, cwd),
  };
}
