import path from "node:path";

const DATA_DIR_GITIGNORE_CONTENT = "/droppers/\n";

export type DataDirWriteDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
};

export async function ensureDataDirGitignore(
  dataDir: string,
  deps: DataDirWriteDeps,
): Promise<void> {
  await deps.ensureDirFn(dataDir);

  const gitignorePath = path.join(dataDir, ".gitignore");
  if (await deps.fileExistsFn(gitignorePath)) {
    return;
  }

  await deps.writeTextFileFn(gitignorePath, DATA_DIR_GITIGNORE_CONTENT);
}

export function getDataDirGitignoreContent(): string {
  return DATA_DIR_GITIGNORE_CONTENT;
}
