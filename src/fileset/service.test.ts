import path from "node:path";
import { describe, expect, test } from "bun:test";
import { AppError } from "../file-utils/errors";
import {
  DefaultFilesetService,
  type FilesetServiceDeps,
  type FilesetStat,
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

function createMemoryFilesetDeps(initialFiles: Record<string, string> = {}): {
  deps: FilesetServiceDeps;
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

  const deps: FilesetServiceDeps = {
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
      const prefix = `${directoryPath}${path.sep}`;
      return Array.from(files.keys()).filter((filePath) => {
        if (!filePath.startsWith(prefix)) {
          return false;
        }

        const relative = filePath.slice(prefix.length);
        return relative.length > 0 && !relative.includes(path.sep);
      });
    },
    deleteFileFn: async (filePath: string): Promise<void> => {
      if (!files.delete(filePath)) {
        throw createNotFoundError(filePath);
      }
    },
    statFileFn: async (filePath: string): Promise<FilesetStat> => {
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

describe("fileset/service", () => {
  test("import writes normalized content and rejects duplicate imports", async () => {
    const { deps, files, ensuredDirs } = createMemoryFilesetDeps();
    const service = new DefaultFilesetService(deps);
    const dataDir = "/data";

    await service.importFromList({
      dataDir,
      name: "demo",
      listFilePath: "/ignored/list.txt",
      normalizedFilePaths: ["/src/a.ts", "/src/b.ts"],
    });

    const filesetPath = path.join(dataDir, "filesets", "demo.txt");
    expect(ensuredDirs.has(path.join(dataDir, "filesets"))).toBe(true);
    expect(files.get(filesetPath)?.content).toBe("/src/a.ts\n/src/b.ts\n");

    await expect(
      service.importFromList({
        dataDir,
        name: "demo",
        listFilePath: "/ignored/list.txt",
        normalizedFilePaths: ["/src/c.ts"],
      }),
    ).rejects.toThrow(AppError);
  });

  test("list returns sorted filesets with parsed files", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryFilesetDeps({
      [path.join(dataDir, "filesets", "b.txt")]: "/b/one.ts\n",
      [path.join(dataDir, "filesets", "a.txt")]: "/a/one.ts\n/a/two.ts\n",
    });
    const service = new DefaultFilesetService(deps);

    const result = await service.list({ dataDir });
    expect(result.map((record) => record.name)).toEqual(["a", "b"]);
    expect(result[0]?.files).toEqual(["/a/one.ts", "/a/two.ts"]);
    expect(result[1]?.files).toEqual(["/b/one.ts"]);
  });

  test("show parses files and includes timestamps", async () => {
    const dataDir = "/data";
    const filesetPath = path.join(dataDir, "filesets", "demo.txt");
    const { deps } = createMemoryFilesetDeps({
      [filesetPath]: " /x.ts \n\n/y.ts\n",
    });
    const service = new DefaultFilesetService(deps);

    const result = await service.show({ dataDir, name: "demo" });
    expect(result.name).toBe("demo");
    expect(result.files).toEqual(["/x.ts", "/y.ts"]);
    expect(result.createdAt.length).toBeGreaterThan(0);
    expect(result.updatedAt.length).toBeGreaterThan(0);
  });

  test("remove blocks when referenced by droppers", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryFilesetDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/x.ts\n",
      [path.join(dataDir, "droppers", "alpha.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {},
      }),
      [path.join(dataDir, "droppers", "beta.json")]: JSON.stringify({
        fileset: "other",
        pointer_position: 0,
        tags: {},
      }),
    });
    const service = new DefaultFilesetService(deps);

    await expect(
      service.remove({ dataDir, name: "demo" }),
    ).rejects.toThrowError(
      "Cannot remove fileset demo: referenced by droppers: alpha",
    );
  });

  test("remove deletes fileset when unreferenced", async () => {
    const dataDir = "/data";
    const filesetPath = path.join(dataDir, "filesets", "demo.txt");
    const { deps, files } = createMemoryFilesetDeps({
      [filesetPath]: "/x.ts\n",
      [path.join(dataDir, "droppers", "beta.json")]: JSON.stringify({
        fileset: "other",
        pointer_position: 0,
        tags: {},
      }),
    });
    const service = new DefaultFilesetService(deps);

    await service.remove({ dataDir, name: "demo" });
    expect(files.has(filesetPath)).toBe(false);
  });
});
