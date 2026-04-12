import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getDataDirGitignoreContent } from "../file-utils/data-dir";
import { AppError } from "../file-utils/errors";
import {
  DefaultTaskService,
  type TaskServiceDeps,
  type TaskStat,
} from "./service";

type MemoryFile = {
  content: string;
  createdAt: string;
  updatedAt: string;
};

function createNotFoundError(filePath: string): NodeJS.ErrnoException {
  const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function createMemoryTaskDeps(initialFiles: Record<string, string> = {}): {
  deps: TaskServiceDeps;
  files: Map<string, MemoryFile>;
  ensuredDirs: Set<string>;
} {
  let tick = 0;
  const files = new Map<string, MemoryFile>();
  const ensuredDirs = new Set<string>();

  const nowIso = (): string => {
    tick += 1;
    return new Date(1_700_000_000_000 + tick * 1000).toISOString();
  };

  for (const [filePath, content] of Object.entries(initialFiles)) {
    const timestamp = nowIso();
    files.set(filePath, {
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  const deps: TaskServiceDeps = {
    ensureDirFn: async (directoryPath: string): Promise<void> => {
      ensuredDirs.add(directoryPath);
    },
    fileExistsFn: async (filePath: string): Promise<boolean> => {
      return files.has(filePath);
    },
    writeTextFileFn: async (
      filePath: string,
      content: string,
    ): Promise<void> => {
      const existing = files.get(filePath);
      const timestamp = nowIso();
      files.set(filePath, {
        content,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    },
    readTextFileFn: async (filePath: string): Promise<string> => {
      const file = files.get(filePath);
      if (file === undefined) {
        throw createNotFoundError(filePath);
      }

      return file.content;
    },
    listFilesFn: async (directoryPath: string): Promise<string[]> => {
      const results: string[] = [];
      for (const filePath of files.keys()) {
        if (filePath.startsWith(directoryPath)) {
          results.push(filePath);
        }
      }
      return results;
    },
    deleteFileFn: async (filePath: string): Promise<void> => {
      if (!files.delete(filePath)) {
        throw createNotFoundError(filePath);
      }
    },
    statFileFn: async (filePath: string): Promise<TaskStat> => {
      const file = files.get(filePath);
      if (file === undefined) {
        throw createNotFoundError(filePath);
      }

      return {
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    },
  };

  return { deps, files, ensuredDirs };
}

describe("task/service", () => {
  test("create stores markdown content with trailing newline", async () => {
    const dataDir = "/data";
    const { deps, files, ensuredDirs } = createMemoryTaskDeps();
    const service = new DefaultTaskService(deps);

    await service.create({
      dataDir,
      name: "review-auth",
      content: "# Review\n\nLook for auth issues.",
    });

    const taskPath = path.join(dataDir, "tasks", "review-auth.md");
    const gitignorePath = path.join(dataDir, ".gitignore");
    expect(ensuredDirs.has(dataDir)).toBe(true);
    expect(ensuredDirs.has(path.join(dataDir, "tasks"))).toBe(true);
    expect(files.get(gitignorePath)?.content).toBe(getDataDirGitignoreContent());
    expect(files.get(taskPath)?.content).toBe("# Review\n\nLook for auth issues.\n");
  });

  test("show round-trips markdown with blank lines", async () => {
    const dataDir = "/data";
    const taskPath = path.join(dataDir, "tasks", "review-auth.md");
    const { deps } = createMemoryTaskDeps({
      [taskPath]: "# Review\n\n- Step 1\n- Step 2\n",
    });
    const service = new DefaultTaskService(deps);

    const task = await service.show({ dataDir, name: "review-auth" });
    expect(task.content).toBe("# Review\n\n- Step 1\n- Step 2\n");
  });

  test("update replaces task content", async () => {
    const dataDir = "/data";
    const taskPath = path.join(dataDir, "tasks", "review-auth.md");
    const { deps, files } = createMemoryTaskDeps({
      [taskPath]: "old\n",
    });
    const service = new DefaultTaskService(deps);

    await service.update({
      dataDir,
      name: "review-auth",
      content: "new\n\nbody",
    });

    expect(files.get(taskPath)?.content).toBe("new\n\nbody\n");
  });

  test("list returns tasks in name order", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryTaskDeps({
      [path.join(dataDir, "tasks", "zeta.md")]: "z\n",
      [path.join(dataDir, "tasks", "alpha.md")]: "a\n",
    });
    const service = new DefaultTaskService(deps);

    const tasks = await service.list({ dataDir });
    expect(tasks.map((task) => task.name)).toEqual(["alpha", "zeta"]);
  });

  test("remove deletes the stored task", async () => {
    const dataDir = "/data";
    const taskPath = path.join(dataDir, "tasks", "review-auth.md");
    const { deps, files } = createMemoryTaskDeps({
      [taskPath]: "content\n",
    });
    const service = new DefaultTaskService(deps);

    await service.remove({ dataDir, name: "review-auth" });
    expect(files.has(taskPath)).toBe(false);
  });

  test("create rejects duplicates and show rejects missing tasks", async () => {
    const dataDir = "/data";
    const taskPath = path.join(dataDir, "tasks", "review-auth.md");
    const { deps } = createMemoryTaskDeps({
      [taskPath]: "content\n",
    });
    const service = new DefaultTaskService(deps);

    await expect(
      service.create({ dataDir, name: "review-auth", content: "next" }),
    ).rejects.toThrow(new AppError("Task already exists: review-auth"));

    await expect(
      service.show({ dataDir, name: "missing" }),
    ).rejects.toThrow(new AppError("Task not found: missing"));
  });
});
