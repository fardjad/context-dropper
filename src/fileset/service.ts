import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ensureDataDirGitignore } from "../file-utils/data-dir";
import { AppError } from "../file-utils/errors";
import type {
  FilesetRecord,
  ImportFilesetInput,
  ListFilesetsInput,
  RemoveFilesetInput,
  ShowFilesetInput,
} from "./types";

export interface FilesetService {
  importFromList(input: ImportFilesetInput): Promise<void>;
  list(input: ListFilesetsInput): Promise<FilesetRecord[]>;
  show(input: ShowFilesetInput): Promise<FilesetRecord>;
  remove(input: RemoveFilesetInput): Promise<void>;
}

export type FilesetStat = {
  createdAt: string;
  updatedAt: string;
};

export type FilesetServiceDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
  readTextFileFn: (filePath: string) => Promise<string>;
  listFilesFn: (directoryPath: string) => Promise<string[]>;
  deleteFileFn: (filePath: string) => Promise<void>;
  statFileFn: (filePath: string) => Promise<FilesetStat>;
};

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const defaultFilesetServiceDeps: FilesetServiceDeps = {
  ensureDirFn: async (directoryPath: string): Promise<void> => {
    await mkdir(directoryPath, { recursive: true });
  },
  fileExistsFn: async (filePath: string): Promise<boolean> => {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  writeTextFileFn: async (filePath: string, content: string): Promise<void> => {
    await writeFile(filePath, content, "utf-8");
  },
  readTextFileFn: async (filePath: string): Promise<string> => {
    return await readFile(filePath, "utf-8");
  },
  listFilesFn: async (directoryPath: string): Promise<string[]> => {
    try {
      const names = await readdir(directoryPath);
      return names.map((name) => path.join(directoryPath, name));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }

      throw error;
    }
  },
  deleteFileFn: async (filePath: string): Promise<void> => {
    await rm(filePath);
  },
  statFileFn: async (filePath: string): Promise<FilesetStat> => {
    const fileStat = await stat(filePath);
    return {
      createdAt: fileStat.ctime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
    };
  },
};

function getFilesetsDirectory(dataDir: string): string {
  return path.join(dataDir, "filesets");
}

function getDroppersDirectory(dataDir: string): string {
  return path.join(dataDir, "droppers");
}

function getFilesetFilePath(dataDir: string, filesetName: string): string {
  return path.join(getFilesetsDirectory(dataDir), `${filesetName}.txt`);
}

function getFilesetBaseDirectory(dataDir: string): string {
  return path.dirname(dataDir);
}

function parseFilesetContent(content: string): string[] {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toPortableRelativePath(pathLike: string): string {
  return pathLike.split(path.sep).join("/");
}

function toStoredFilesetPath(dataDir: string, absoluteFilePath: string): string {
  const baseDir = getFilesetBaseDirectory(dataDir);
  const relativePath = path.relative(baseDir, absoluteFilePath);

  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new AppError(
      `Fileset entry is outside the fileset base directory: ${absoluteFilePath}`,
    );
  }

  return toPortableRelativePath(relativePath);
}

function parseDropperReference(
  rawJson: string,
  dropperPath: string,
): { fileset: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new AppError(`Invalid dropper metadata: ${dropperPath}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as { fileset?: unknown }).fileset !== "string"
  ) {
    throw new AppError(`Invalid dropper metadata: ${dropperPath}`);
  }

  return {
    fileset: (parsed as { fileset: string }).fileset,
  };
}

export class DefaultFilesetService implements FilesetService {
  constructor(
    private readonly deps: FilesetServiceDeps = defaultFilesetServiceDeps,
  ) {}

  async importFromList(input: ImportFilesetInput): Promise<void> {
    await ensureDataDirGitignore(input.dataDir, this.deps);

    const filesetsDirectory = getFilesetsDirectory(input.dataDir);
    const filesetFilePath = getFilesetFilePath(input.dataDir, input.name);

    await this.deps.ensureDirFn(filesetsDirectory);
    if (await this.deps.fileExistsFn(filesetFilePath)) {
      throw new AppError(`Fileset already exists: ${input.name}`);
    }

    const storedPaths = input.normalizedFilePaths.map((filePath) =>
      toStoredFilesetPath(input.dataDir, filePath),
    );
    const content =
      storedPaths.length === 0 ? "" : `${storedPaths.join("\n")}\n`;
    await this.deps.writeTextFileFn(filesetFilePath, content);
  }

  async list(input: ListFilesetsInput): Promise<FilesetRecord[]> {
    const filesetPaths = (
      await this.deps.listFilesFn(getFilesetsDirectory(input.dataDir))
    )
      .filter((filePath) => filePath.endsWith(".txt"))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    const records: FilesetRecord[] = [];
    for (const filesetPath of filesetPaths) {
      const name = path.basename(filesetPath, ".txt");
      records.push(
        await this.show({
          dataDir: input.dataDir,
          name,
        }),
      );
    }

    return records;
  }

  async show(input: ShowFilesetInput): Promise<FilesetRecord> {
    const filesetFilePath = getFilesetFilePath(input.dataDir, input.name);
    if (!(await this.deps.fileExistsFn(filesetFilePath))) {
      throw new AppError(`Fileset not found: ${input.name}`);
    }

    const [content, fileStat] = await Promise.all([
      this.deps.readTextFileFn(filesetFilePath),
      this.deps.statFileFn(filesetFilePath),
    ]);

    return {
      name: input.name,
      files: parseFilesetContent(content),
      createdAt: fileStat.createdAt,
      updatedAt: fileStat.updatedAt,
    };
  }

  async remove(input: RemoveFilesetInput): Promise<void> {
    const filesetFilePath = getFilesetFilePath(input.dataDir, input.name);
    if (!(await this.deps.fileExistsFn(filesetFilePath))) {
      throw new AppError(`Fileset not found: ${input.name}`);
    }

    const dependentDroppers: string[] = [];
    const dropperPaths = (
      await this.deps.listFilesFn(getDroppersDirectory(input.dataDir))
    ).filter((dropperPath) => dropperPath.endsWith(".json"));

    for (const dropperPath of dropperPaths) {
      const dropperContent = await this.deps.readTextFileFn(dropperPath);
      const reference = parseDropperReference(dropperContent, dropperPath);
      if (reference.fileset === input.name) {
        dependentDroppers.push(path.basename(dropperPath, ".json"));
      }
    }

    if (dependentDroppers.length > 0) {
      throw new AppError(
        `Cannot remove fileset ${input.name}: referenced by droppers: ${dependentDroppers.join(", ")}`,
      );
    }

    await this.deps.deleteFileFn(filesetFilePath);
  }
}
