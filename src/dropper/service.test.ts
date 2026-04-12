import { describe, expect, test } from "bun:test";
import path from "node:path";
import { getDataDirGitignoreContent } from "../file-utils/data-dir";
import { AppError } from "../file-utils/errors";
import { DropperAtStartError, DropperExhaustedError } from "./errors";
import { DefaultDropperService, type DropperServiceDeps } from "./service";

type MemoryFile = {
  content: string;
};

function createNotFoundError(filePath: string): NodeJS.ErrnoException {
  const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function createMemoryDropperDeps(initialFiles: Record<string, string> = {}): {
  deps: DropperServiceDeps;
  files: Map<string, MemoryFile>;
  ensuredDirs: Set<string>;
} {
  const files = new Map<string, MemoryFile>();
  const ensuredDirs = new Set<string>();

  for (const [filePath, content] of Object.entries(initialFiles)) {
    files.set(filePath, { content });
  }

  const deps: DropperServiceDeps = {
    ensureDirFn: async (directoryPath: string): Promise<void> => {
      ensuredDirs.add(directoryPath);
    },
    fileExistsFn: async (filePath: string): Promise<boolean> => {
      return files.has(filePath);
    },
    readTextFileFn: async (filePath: string): Promise<string> => {
      const file = files.get(filePath);
      if (file === undefined) {
        throw createNotFoundError(filePath);
      }

      return file.content;
    },
    writeTextFileFn: async (
      filePath: string,
      content: string,
    ): Promise<void> => {
      files.set(filePath, { content });
    },
    deleteFileFn: async (filePath: string): Promise<void> => {
      if (!files.delete(filePath)) {
        throw createNotFoundError(filePath);
      }
    },
    readDirFn: async (directoryPath: string): Promise<string[]> => {
      const results: string[] = [];
      for (const filePath of files.keys()) {
        if (filePath.startsWith(directoryPath)) {
          results.push(path.basename(filePath));
        }
      }
      return results;
    },
  };

  return { deps, files, ensuredDirs };
}

describe("dropper/service", () => {
  test("create stores fileset, task, and pointer", async () => {
    const dataDir = "/data";
    const { deps, files, ensuredDirs } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
    });
    const service = new DefaultDropperService(deps);

    await service.create({
      dataDir,
      filesetName: "demo",
      taskName: "review",
      dropperName: "d1",
    });

    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const gitignorePath = path.join(dataDir, ".gitignore");
    expect(ensuredDirs.has(dataDir)).toBe(true);
    expect(ensuredDirs.has(path.join(dataDir, "droppers"))).toBe(true);
    expect(files.get(gitignorePath)?.content).toBe(getDataDirGitignoreContent());
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toEqual({
      fileset: "demo",
      task: "review",
      pointer_position: 0,
    });
  });

  test("showTaskPrompt renders loop context, current file, task body, and protocol", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "tasks", "review.md")]:
        "# Review\n\nLook for auth issues.\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 1,
      }),
    });
    const service = new DefaultDropperService(deps);

    const prompt = await service.showTaskPrompt({ dataDir, dropperName: "d1" });
    expect(prompt).toContain("Current file:\n/src/b.ts");
    expect(prompt).toContain("User request:\n# Review\n\nLook for auth issues.");
    expect(prompt).toContain("Reply with exactly one line:");
    expect(prompt).toContain("STATUS: SUCCESS");
    expect(prompt).toContain("or\nSTATUS: FAILURE");
  });

  test("next advances into done state and then errors when already done", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 1,
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.next({ dataDir, dropperName: "d1" });
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toMatchObject({
      pointer_position: 2,
    });

    await expect(service.next({ dataDir, dropperName: "d1" })).rejects.toThrow(
      DropperExhaustedError,
    );
  });

  test("previous moves back from done to last file and errors at start", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 2,
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.previous({ dataDir, dropperName: "d1" });
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toMatchObject({
      pointer_position: 1,
    });

    await service.previous({ dataDir, dropperName: "d1" });
    await expect(
      service.previous({ dataDir, dropperName: "d1" }),
    ).rejects.toThrow(DropperAtStartError);
  });

  test("isDone returns false before completion and true after completion", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 1,
      }),
      [path.join(dataDir, "droppers", "d2.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 2,
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.isDone({ dataDir, dropperName: "d1" }),
    ).resolves.toBe(false);
    await expect(
      service.isDone({ dataDir, dropperName: "d2" }),
    ).resolves.toBe(true);
  });

  test("empty filesets are immediately done and have no pending files", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 0,
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.isDone({ dataDir, dropperName: "d1" }),
    ).resolves.toBe(true);
    await expect(
      service.listFiles({ dataDir, dropperName: "d1", status: "pending" }),
    ).resolves.toEqual([]);
  });

  test("listFiles partitions files by done and pending status", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]:
        "/src/a.ts\n/src/b.ts\n/src/c.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 1,
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.listFiles({ dataDir, dropperName: "d1", status: "all" }),
    ).resolves.toEqual(["/src/a.ts", "/src/b.ts", "/src/c.ts"]);
    await expect(
      service.listFiles({ dataDir, dropperName: "d1", status: "done" }),
    ).resolves.toEqual(["/src/a.ts"]);
    await expect(
      service.listFiles({ dataDir, dropperName: "d1", status: "pending" }),
    ).resolves.toEqual(["/src/b.ts", "/src/c.ts"]);
  });

  test("list retrieves droppers and honors fileset filter", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "f1",
        task: "t1",
        pointer_position: 0,
      }),
      [path.join(dataDir, "droppers", "d2.json")]: JSON.stringify({
        fileset: "f2",
        task: "t2",
        pointer_position: 0,
      }),
      [path.join(dataDir, "droppers", "broken.json")]: "invalid json",
    });
    deps.readDirFn = async () => ["d1.json", "d2.json", "broken.json", "note.txt"];
    const service = new DefaultDropperService(deps);

    await expect(service.list({ dataDir })).resolves.toEqual([
      "broken",
      "d1",
      "d2",
    ]);
    await expect(service.list({ dataDir, filesetName: "f1" })).resolves.toEqual([
      "d1",
    ]);
  });

  test("remove deletes the persisted dropper", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 0,
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.remove({ dataDir, dropperName: "d1" });
    expect(files.has(dropperPath)).toBe(false);
  });

  test("showTaskPrompt fails when the dropper is already done", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n",
      [path.join(dataDir, "tasks", "review.md")]: "Review this file.\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        task: "review",
        pointer_position: 1,
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.showTaskPrompt({ dataDir, dropperName: "d1" }),
    ).rejects.toThrow(DropperExhaustedError);
  });

  test("create rejects missing tasks", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n",
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.create({
        dataDir,
        filesetName: "demo",
        taskName: "missing",
        dropperName: "d1",
      }),
    ).rejects.toThrow(new AppError("Task not found: missing"));
  });
});
