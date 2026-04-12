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
  CreateTaskInput,
  ListTasksInput,
  RemoveTaskInput,
  ShowTaskInput,
  TaskRecord,
  UpdateTaskInput,
} from "./types";

export interface TaskService {
  create(input: CreateTaskInput): Promise<void>;
  update(input: UpdateTaskInput): Promise<void>;
  show(input: ShowTaskInput): Promise<TaskRecord>;
  list(input: ListTasksInput): Promise<TaskRecord[]>;
  remove(input: RemoveTaskInput): Promise<void>;
}

export type TaskStat = {
  createdAt: string;
  updatedAt: string;
};

export type TaskServiceDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
  readTextFileFn: (filePath: string) => Promise<string>;
  listFilesFn: (directoryPath: string) => Promise<string[]>;
  deleteFileFn: (filePath: string) => Promise<void>;
  statFileFn: (filePath: string) => Promise<TaskStat>;
};

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const defaultTaskServiceDeps: TaskServiceDeps = {
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
  statFileFn: async (filePath: string): Promise<TaskStat> => {
    const fileStat = await stat(filePath);
    return {
      createdAt: fileStat.ctime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
    };
  },
};

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function getTasksDirectory(dataDir: string): string {
  return path.join(dataDir, "tasks");
}

function getTaskFilePath(dataDir: string, taskName: string): string {
  return path.join(getTasksDirectory(dataDir), `${taskName}.md`);
}

export class DefaultTaskService implements TaskService {
  constructor(private readonly deps: TaskServiceDeps = defaultTaskServiceDeps) {}

  async create(input: CreateTaskInput): Promise<void> {
    await ensureDataDirGitignore(input.dataDir, this.deps);

    const tasksDirectory = getTasksDirectory(input.dataDir);
    const taskFilePath = getTaskFilePath(input.dataDir, input.name);

    await this.deps.ensureDirFn(tasksDirectory);
    if (await this.deps.fileExistsFn(taskFilePath)) {
      throw new AppError(`Task already exists: ${input.name}`);
    }

    await this.deps.writeTextFileFn(taskFilePath, withTrailingNewline(input.content));
  }

  async update(input: UpdateTaskInput): Promise<void> {
    const taskFilePath = getTaskFilePath(input.dataDir, input.name);
    if (!(await this.deps.fileExistsFn(taskFilePath))) {
      throw new AppError(`Task not found: ${input.name}`);
    }

    await this.deps.writeTextFileFn(taskFilePath, withTrailingNewline(input.content));
  }

  async show(input: ShowTaskInput): Promise<TaskRecord> {
    const taskFilePath = getTaskFilePath(input.dataDir, input.name);
    if (!(await this.deps.fileExistsFn(taskFilePath))) {
      throw new AppError(`Task not found: ${input.name}`);
    }

    const [content, fileStat] = await Promise.all([
      this.deps.readTextFileFn(taskFilePath),
      this.deps.statFileFn(taskFilePath),
    ]);

    return {
      name: input.name,
      content,
      createdAt: fileStat.createdAt,
      updatedAt: fileStat.updatedAt,
    };
  }

  async list(input: ListTasksInput): Promise<TaskRecord[]> {
    const taskPaths = (await this.deps.listFilesFn(getTasksDirectory(input.dataDir)))
      .filter((filePath) => filePath.endsWith(".md"))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    const records: TaskRecord[] = [];
    for (const taskPath of taskPaths) {
      const name = path.basename(taskPath, ".md");
      records.push(await this.show({ dataDir: input.dataDir, name }));
    }

    return records;
  }

  async remove(input: RemoveTaskInput): Promise<void> {
    const taskFilePath = getTaskFilePath(input.dataDir, input.name);
    if (!(await this.deps.fileExistsFn(taskFilePath))) {
      throw new AppError(`Task not found: ${input.name}`);
    }

    await this.deps.deleteFileFn(taskFilePath);
  }
}
