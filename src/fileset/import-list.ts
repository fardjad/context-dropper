import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertReadableFile,
  normalizeAbsolutePath,
} from "../file-utils/validation";

export type FilesetImportReadDeps = {
  assertReadableFileFn: (filePath: string, label: string) => Promise<void>;
  readTextFileFn: (filePath: string) => Promise<string>;
  dirnameFn: (filePath: string) => string;
  normalizeAbsolutePathFn: (pathLike: string, baseDir: string) => string;
};

export const defaultFilesetImportReadDeps: FilesetImportReadDeps = {
  assertReadableFileFn: assertReadableFile,
  readTextFileFn: async (filePath: string): Promise<string> =>
    await readFile(filePath, "utf-8"),
  dirnameFn: path.dirname,
  normalizeAbsolutePathFn: normalizeAbsolutePath,
};

export async function readAndValidateFilesetEntries(
  listFilePath: string,
  deps: FilesetImportReadDeps = defaultFilesetImportReadDeps,
): Promise<string[]> {
  await deps.assertReadableFileFn(listFilePath, "Fileset list file");

  const listFileText = await deps.readTextFileFn(listFilePath);
  const listFileDirectory = deps.dirnameFn(listFilePath);
  const normalizedFilePaths: string[] = [];

  for (const rawLine of listFileText.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const normalizedPath = deps.normalizeAbsolutePathFn(
      line,
      listFileDirectory,
    );
    await deps.assertReadableFileFn(normalizedPath, "Fileset entry");
    normalizedFilePaths.push(normalizedPath);
  }

  return normalizedFilePaths;
}
