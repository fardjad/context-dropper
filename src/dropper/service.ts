import {
  mkdir,
  readdir,
  rm,
  stat,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import path from "node:path";
import { AppError } from "../file-utils/errors";
import { DropperAtStartError, DropperExhaustedError } from "./errors";
import type {
  CreateDropperInput,
  DropperEntry,
  DropperRecord,
  DumpDropperInput,
  IsDoneDropperInput,
  ListDropperInput,
  ListFilesDropperInput,
  ListDropperTagsInput,
  NextDropperInput,
  PreviousDropperInput,
  RemoveDropperInput,
  RemoveDropperTagsInput,
  ShowDropperInput,
  TagDropperInput,
  PersistedDropper,
} from "./types";

export interface DropperService {
  create(input: CreateDropperInput): Promise<void>;
  show(input: ShowDropperInput): Promise<string>;
  next(input: NextDropperInput): Promise<void>;
  previous(input: PreviousDropperInput): Promise<void>;
  tag(input: TagDropperInput): Promise<void>;
  listTags(input: ListDropperTagsInput): Promise<string[]>;
  removeTags(input: RemoveDropperTagsInput): Promise<void>;
  list(input: ListDropperInput): Promise<string[]>;
  listFiles(input: ListFilesDropperInput): Promise<DropperEntry[]>;
  remove(input: RemoveDropperInput): Promise<void>;
  dump(input: DumpDropperInput): Promise<DropperRecord>;
  isDone(input: IsDoneDropperInput): Promise<boolean>;
}

export type DropperStat = {
  createdAt: string;
  updatedAt: string;
};

export type DropperServiceDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  readTextFileFn: (filePath: string) => Promise<string>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
  deleteFileFn: (filePath: string) => Promise<void>;
  statFileFn: (filePath: string) => Promise<DropperStat>;
  readSourceFileFn: (filePath: string) => Promise<string>;
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
  statFileFn: async (filePath: string): Promise<DropperStat> => {
    const fileStat = await stat(filePath);
    return {
      createdAt: fileStat.ctime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
    };
  },
  readSourceFileFn: async (filePath: string): Promise<string> => {
    return await readFile(filePath, "utf-8");
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

function getDroppersDirectory(dataDir: string): string {
  return path.join(dataDir, "droppers");
}

function getFilesetFilePath(dataDir: string, filesetName: string): string {
  return path.join(getFilesetsDirectory(dataDir), `${filesetName}.txt`);
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

function normalizeTagMap(
  tags: Record<string, string[]>,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};

  for (const [tag, files] of Object.entries(tags)) {
    normalized[tag] = Array.from(new Set(files)).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  return normalized;
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
    pointer_position?: unknown;
    tags?: unknown;
  };
  if (typeof candidate.fileset !== "string" || candidate.fileset.length === 0) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  if (
    typeof candidate.pointer_position !== "number" ||
    !Number.isInteger(candidate.pointer_position)
  ) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  if (
    typeof candidate.tags !== "object" ||
    candidate.tags === null ||
    Array.isArray(candidate.tags)
  ) {
    throw new AppError(`Invalid dropper data: ${dropperName}`);
  }

  const tagsInput = candidate.tags as Record<string, unknown>;
  const tags: Record<string, string[]> = {};

  for (const [tag, files] of Object.entries(tagsInput)) {
    if (
      !Array.isArray(files) ||
      files.some((value) => typeof value !== "string")
    ) {
      throw new AppError(`Invalid dropper data: ${dropperName}`);
    }

    tags[tag] = Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));
  }

  return {
    fileset: candidate.fileset,
    pointer_position: candidate.pointer_position,
    tags,
  };
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
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
    const normalized: PersistedDropper = {
      ...persistedDropper,
      tags: normalizeTagMap(persistedDropper.tags),
    };
    const content = withTrailingNewline(JSON.stringify(normalized, null, 2));
    await this.deps.writeTextFileFn(dropperPath, content);
  }

  private getCurrentFile(
    persistedDropper: PersistedDropper,
    filesetFiles: string[],
  ): string {
    const pointer = persistedDropper.pointer_position;
    if (
      filesetFiles.length === 0 ||
      pointer < 0 ||
      pointer >= filesetFiles.length
    ) {
      throw new DropperExhaustedError();
    }

    const currentFile = filesetFiles[pointer];
    if (currentFile === undefined) {
      throw new DropperExhaustedError();
    }

    return currentFile;
  }

  private buildEntries(
    filesetFiles: string[],
    tags: Record<string, string[]>,
  ): DropperEntry[] {
    const fileTags = new Map<string, Set<string>>();
    for (const [tag, files] of Object.entries(tags)) {
      for (const filePath of files) {
        const currentTags = fileTags.get(filePath) ?? new Set<string>();
        currentTags.add(tag);
        fileTags.set(filePath, currentTags);
      }
    }

    return filesetFiles.map((filePath) => {
      const tagsForFile = Array.from(fileTags.get(filePath) ?? []).sort(
        (a, b) => a.localeCompare(b),
      );
      return {
        path: filePath,
        tags: tagsForFile,
      };
    });
  }

  async create(input: CreateDropperInput): Promise<void> {
    const filesetPath = getFilesetFilePath(input.dataDir, input.filesetName);
    if (!(await this.deps.fileExistsFn(filesetPath))) {
      throw new AppError(`Fileset not found: ${input.filesetName}`);
    }

    const droppersDirectory = getDroppersDirectory(input.dataDir);
    await this.deps.ensureDirFn(droppersDirectory);

    const dropperPath = getDropperFilePath(input.dataDir, input.dropperName);
    if (await this.deps.fileExistsFn(dropperPath)) {
      throw new AppError(`Dropper already exists: ${input.dropperName}`);
    }

    await this.saveDropper(dropperPath, {
      fileset: input.filesetName,
      pointer_position: 0,
      tags: {},
    });
  }

  async show(input: ShowDropperInput): Promise<string> {
    const { persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const currentFile = this.getCurrentFile(persisted, filesetFiles);
    return this.deps.readSourceFileFn(currentFile);
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
    if (
      filesetFiles.length === 0 ||
      persisted.pointer_position < 0 ||
      persisted.pointer_position >= filesetFiles.length - 1
    ) {
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
    if (
      filesetFiles.length === 0 ||
      persisted.pointer_position <= 0 ||
      persisted.pointer_position >= filesetFiles.length
    ) {
      throw new DropperAtStartError();
    }

    persisted.pointer_position -= 1;
    await this.saveDropper(filePath, persisted);
  }

  async tag(input: TagDropperInput): Promise<void> {
    const { filePath, persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const currentFile = this.getCurrentFile(persisted, filesetFiles);

    for (const tag of input.tags) {
      const updated = new Set([...(persisted.tags[tag] ?? []), currentFile]);
      persisted.tags[tag] = Array.from(updated).sort((a, b) =>
        a.localeCompare(b),
      );
    }

    await this.saveDropper(filePath, persisted);
  }

  async listTags(input: ListDropperTagsInput): Promise<string[]> {
    const { persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const currentFile = this.getCurrentFile(persisted, filesetFiles);

    const tags = Object.entries(persisted.tags)
      .filter(([, files]) => files.includes(currentFile))
      .map(([tag]) => tag)
      .sort((a, b) => a.localeCompare(b));

    return tags;
  }

  async removeTags(input: RemoveDropperTagsInput): Promise<void> {
    const { filePath, persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const currentFile = this.getCurrentFile(persisted, filesetFiles);

    for (const tag of input.tags) {
      const existing = persisted.tags[tag];
      if (existing === undefined) {
        continue;
      }

      const next = existing.filter((filePath) => filePath !== currentFile);
      if (next.length === 0) {
        delete persisted.tags[tag];
      } else {
        persisted.tags[tag] = Array.from(new Set(next)).sort((a, b) =>
          a.localeCompare(b),
        );
      }
    }

    await this.saveDropper(filePath, persisted);
  }

  async listFiles(input: ListFilesDropperInput): Promise<DropperEntry[]> {
    const { persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    let entries = this.buildEntries(filesetFiles, persisted.tags);

    if (input.filename !== undefined) {
      const matched = entries.find((entry) => entry.path === input.filename);
      entries = matched === undefined ? [] : [matched];
    }

    if (input.tags !== undefined && input.tags.length > 0) {
      const wanted = new Set(input.tags);
      entries = entries.filter((entry) =>
        entry.tags.some((tag) => wanted.has(tag)),
      );
    }

    return entries;
  }

  async list(input: ListDropperInput): Promise<string[]> {
    const droppersDirectory = getDroppersDirectory(input.dataDir);
    const files = await this.deps.readDirFn(droppersDirectory);

    // Get all valid dropper names by stripping .json extension
    const validNames = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5))
      .sort((a, b) => a.localeCompare(b));

    if (input.filesetName === undefined) {
      return validNames;
    }

    // If filtering by fileset, we need to read each dropper to check its fileset source
    const matchedDroppers: string[] = [];
    for (const name of validNames) {
      try {
        const { persisted } = await this.loadDropper(input.dataDir, name);
        if (persisted.fileset === input.filesetName) {
          matchedDroppers.push(name);
        }
      } catch (error) {
        // Ignore files that are broken
        continue;
      }
    }

    return matchedDroppers;
  }

  async remove(input: RemoveDropperInput): Promise<void> {
    const dropperPath = getDropperFilePath(input.dataDir, input.dropperName);
    if (!(await this.deps.fileExistsFn(dropperPath))) {
      throw new AppError(`Dropper not found: ${input.dropperName}`);
    }

    await this.deps.deleteFileFn(dropperPath);
  }

  async dump(input: DumpDropperInput): Promise<DropperRecord> {
    const { filePath, persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const entries = this.buildEntries(filesetFiles, persisted.tags);
    const metadata = await this.deps.statFileFn(filePath);
    const pointer =
      persisted.pointer_position >= 0 &&
      persisted.pointer_position < entries.length
        ? persisted.pointer_position
        : null;

    return {
      name: input.dropperName,
      filesetName: persisted.fileset,
      entries,
      pointer: {
        currentIndex: pointer,
        total: entries.length,
      },
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  }

  async isDone(input: IsDoneDropperInput): Promise<boolean> {
    const { persisted } = await this.loadDropper(
      input.dataDir,
      input.dropperName,
    );
    const filesetFiles = await this.loadFilesetFiles(
      input.dataDir,
      persisted.fileset,
    );
    const entries = this.buildEntries(filesetFiles, persisted.tags);
    const untaggedPaths = entries
      .filter((entry) => entry.tags.length === 0)
      .map((entry) => entry.path);

    if (untaggedPaths.length > 0) {
      throw new AppError(`Untagged items remain:\n${untaggedPaths.join("\n")}`);
    }

    return true;
  }
}
