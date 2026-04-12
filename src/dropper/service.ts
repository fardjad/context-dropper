import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ensureDataDirGitignore } from "../file-utils/data-dir";
import { AppError } from "../file-utils/errors";
import { DropperAtStartError, DropperExhaustedError } from "./errors";
import type {
  CreateDropperInput,
  IsDoneDropperInput,
  ListDropperInput,
  ListFilesDropperInput,
  PersistedDropper,
  PreviousDropperInput,
  RemoveDropperInput,
  ShowTaskPromptInput,
  NextDropperInput,
} from "./types";

export interface DropperService {
  create(input: CreateDropperInput): Promise<void>;
  showTaskPrompt(input: ShowTaskPromptInput): Promise<string>;
  next(input: NextDropperInput): Promise<void>;
  previous(input: PreviousDropperInput): Promise<void>;
  list(input: ListDropperInput): Promise<string[]>;
  listFiles(input: ListFilesDropperInput): Promise<string[]>;
  remove(input: RemoveDropperInput): Promise<void>;
  isDone(input: IsDoneDropperInput): Promise<boolean>;
}

export type DropperServiceDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  readTextFileFn: (filePath: string) => Promise<string>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
  deleteFileFn: (filePath: string) => Promise<void>;
  readDirFn: (directoryPath: string) => Promise<string[]>;
};

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const defaultDropperServiceDeps: DropperServiceDeps = {
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
  readTextFileFn: async (filePath: string): Promise<string> => {
    return await readFile(filePath, "utf-8");
  },
  writeTextFileFn: async (filePath: string, content: string): Promise<void> => {
    await writeFile(filePath, content, "utf-8");
  },
  deleteFileFn: async (filePath: string): Promise<void> => {
    await rm(filePath);
  },
  readDirFn: async (directoryPath: string): Promise<string[]> => {
    try {
      return await readdir(directoryPath);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }

      throw error;
    }
  },
};

function getFilesetsDirectory(dataDir: string): string {
  return path.join(dataDir, "filesets");
}

function getTasksDirectory(dataDir: string): string {
  return path.join(dataDir, "tasks");
}

function getDroppersDirectory(dataDir: string): string {
  return path.join(dataDir, "droppers");
}

function getFilesetFilePath(dataDir: string, filesetName: string): string {
  return path.join(getFilesetsDirectory(dataDir), `${filesetName}.txt`);
}

function getTaskFilePath(dataDir: string, taskName: string): string {
  return path.join(getTasksDirectory(dataDir), `${taskName}.md`);
}

function getDropperFilePath(dataDir: string, dropperName: string): string {
  return path.join(getDroppersDirectory(dataDir), `${dropperName}.json`);
}

function parseFilesetContent(content: string): string[] {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parsePersistedDropper(
  dropperName: string,
  rawJson: string,
): PersistedDropper {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  const candidate = parsed as {
    fileset?: unknown;
    task?: unknown;
    pointer_position?: unknown;
  };

  if (typeof candidate.fileset !== "string" || candidate.fileset.length === 0) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  if (typeof candidate.task !== "string" || candidate.task.length === 0) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  if (
    typeof candidate.pointer_position !== "number" ||
    !Number.isInteger(candidate.pointer_position)
  ) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  return {
    fileset: candidate.fileset,
    task: candidate.task,
    pointer_position: candidate.pointer_position,
  };
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildTaskPrompt(currentFile: string, taskBody: string): string {
  const trimmedTaskBody = taskBody.trimEnd();

  return withTrailingNewline(
    [
      "Current file:",
      currentFile,
      "",
      "User request:",
      trimmedTaskBody.length === 0 ? "(empty task)" : trimmedTaskBody,
      "",
      "Response protocol:",
      "Reply with exactly one line:",
      "STATUS: SUCCESS",
      "or",
      "STATUS: FAILURE",
    ].join("\n"),
  );
}

export class DefaultDropperService implements DropperService {
  constructor(
    private readonly deps: DropperServiceDeps = defaultDropperServiceDeps,
  ) {}

  private async loadFilesetFiles(
    dataDir: string,
    filesetName: string,
  ): Promise<string[]> {
    const filesetPath = getFilesetFilePath(dataDir, filesetName);
    if (!(await this.deps.fileExistsFn(filesetPath))) {
      throw new AppError(`Fileset not found: ${filesetName}`);
    }

    const content = await this.deps.readTextFileFn(filesetPath);
    return parseFilesetContent(content);
  }

  private async loadTaskContent(
    dataDir: string,
    taskName: string,
  ): Promise<string> {
    const taskPath = getTaskFilePath(dataDir, taskName);
    if (!(await this.deps.fileExistsFn(taskPath))) {
      throw new AppError(`Task not found: ${taskName}`);
    }

    return await this.deps.readTextFileFn(taskPath);
  }

  private async loadDropper(
    dataDir: string,
    dropperName: string,
  ): Promise<{ filePath: string; persisted: PersistedDropper }> {
    const dropperPath = getDropperFilePath(dataDir, dropperName);
    if (!(await this.deps.fileExistsFn(dropperPath))) {
      throw new AppError(`Dropper not found: ${dropperName}`);
    }

    const rawJson = await this.deps.readTextFileFn(dropperPath);
    return {
      filePath: dropperPath,
      persisted: parsePersistedDropper(dropperName, rawJson),
    };
  }

  private async saveDropper(
    dropperPath: string,
    persistedDropper: PersistedDropper,
  ): Promise<void> {
    const content = withTrailingNewline(
      JSON.stringify(persistedDropper, null, 2),
    );
    await this.deps.writeTextFileFn(dropperPath, content);
  }

  private ensurePointerWithinBounds(
    dropperName: string,
    persistedDropper: PersistedDropper,
    filesetFiles: string[],
  ): void {
    if (
      persistedDropper.pointer_position < 0 ||
      persistedDropper.pointer_position > filesetFiles.length
    ) {
      throw new AppError(`Invalid dropper data: ${dropperName}`);
    }
  }

  async create(input: CreateDropperInput): Promise<void> {
    await ensureDataDirGitignore(input.dataDir, this.deps);

    const filesetPath = getFilesetFilePath(input.dataDir, input.filesetName);
    if (!(await this.deps.fileExistsFn(filesetPath))) {
      throw new AppError(`Fileset not found: ${input.filesetName}`);
    }

    const taskPath = getTaskFilePath(input.dataDir, input.taskName);
    if (!(await this.deps.fileExistsFn(taskPath))) {
      throw new AppError(`Task not found: ${input.taskName}`);
    }

    const droppersDirectory = getDroppersDirectory(input.dataDir);
    await this.deps.ensureDirFn(droppersDirectory);

    const dropperPath = getDropperFilePath(input.dataDir, input.dropperName);
    if (await this.deps.fileExistsFn(dropperPath)) {
      throw new AppError(`Dropper already exists: ${input.dropperName}`);
    }

    await this.saveDropper(dropperPath, {
      fileset: input.filesetName,
      task: input.taskName,
      pointer_position: 0,
    });
  }

  async showTaskPrompt(input: ShowTaskPromptInput): Promise<string> {
    const { persisted } = await this.loadDropper(input.dataDir, input.dropperName);
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );

    this.ensurePointerWithinBounds(input.dropperName, persisted, filesetFiles);
    if (persisted.pointer_position >= filesetFiles.length) {
      throw new DropperExhaustedError();
    }

    const currentFile = filesetFiles[persisted.pointer_position];
    if (currentFile === undefined) {
      throw new DropperExhaustedError();
    }

    const taskBody = await this.loadTaskContent(input.dataDir, persisted.task);
    return buildTaskPrompt(currentFile, taskBody);
  }

  async next(input: NextDropperInput): Promise<void> {
    const { filePath, persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );

    this.ensurePointerWithinBounds(input.dropperName, persisted, filesetFiles);
    if (persisted.pointer_position >= filesetFiles.length) {
      throw new DropperExhaustedError();
    }

    persisted.pointer_position += 1;
    await this.saveDropper(filePath, persisted);
  }

  async previous(input: PreviousDropperInput): Promise<void> {
    const { filePath, persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );

    this.ensurePointerWithinBounds(input.dropperName, persisted, filesetFiles);

    if (filesetFiles.length === 0 || persisted.pointer_position === 0) {
      throw new DropperAtStartError();
    }

    if (persisted.pointer_position > filesetFiles.length) {
      throw new AppError(`Invalid dropper data: ${input.dropperName}`);
    }

    persisted.pointer_position -= 1;
    await this.saveDropper(filePath, persisted);
  }

  async list(input: ListDropperInput): Promise<string[]> {
    const droppersDirectory = getDroppersDirectory(input.dataDir);
    const files = await this.deps.readDirFn(droppersDirectory);
    const validNames = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5))
      .sort((a, b) => a.localeCompare(b));

    if (input.filesetName === undefined) {
      return validNames;
    }

    const matchedDroppers: string[] = [];
    for (const name of validNames) {
      try {
        const { persisted } = await this.loadDropper(input.dataDir, name);
        if (persisted.fileset === input.filesetName) {
          matchedDroppers.push(name);
        }
      } catch {}
    }

    return matchedDroppers;
  }

  async listFiles(input: ListFilesDropperInput): Promise<string[]> {
    const { persisted } = await this.loadDropper(input.dataDir, input.dropperName);
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );

    this.ensurePointerWithinBounds(input.dropperName, persisted, filesetFiles);

    return filesetFiles.filter((_filePath, index) => {
      if (input.status === "all") {
        return true;
      }

      if (input.status === "done") {
        return index < persisted.pointer_position;
      }

      return index >= persisted.pointer_position;
    });
  }

  async remove(input: RemoveDropperInput): Promise<void> {
    const dropperPath = getDropperFilePath(input.dataDir, input.dropperName);
    if (!(await this.deps.fileExistsFn(dropperPath))) {
      throw new AppError(`Dropper not found: ${input.dropperName}`);
    }

    await this.deps.deleteFileFn(dropperPath);
  }

  async isDone(input: IsDoneDropperInput): Promise<boolean> {
    const { persisted } = await this.loadDropper(input.dataDir, input.dropperName);
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );

    this.ensurePointerWithinBounds(input.dropperName, persisted, filesetFiles);
    return persisted.pointer_position >= filesetFiles.length;
  }
}
