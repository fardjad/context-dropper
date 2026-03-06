import path from "node:path";
import { describe, expect, test } from "bun:test";
import { AppError } from "../file-utils/errors";
import { DropperAtStartError, DropperExhaustedError } from "./errors";
import {
  DefaultDropperService,
  type DropperServiceDeps,
  type DropperStat,
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

function createMemoryDropperDeps(initialFiles: Record<string, string> = {}): {
  deps: DropperServiceDeps;
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
      const existing = files.get(filePath);
      const timestamp = nowIso();
      files.set(filePath, {
        content,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    },
    deleteFileFn: async (filePath: string): Promise<void> => {
      if (!files.delete(filePath)) {
        throw createNotFoundError(filePath);
      }
    },
    statFileFn: async (filePath: string): Promise<DropperStat> => {
      const file = files.get(filePath);
      if (file === undefined) {
        throw createNotFoundError(filePath);
      }

      return {
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    },
    readSourceFileFn: async (filePath: string): Promise<string> => {
      const file = files.get(filePath);
      if (file === undefined) {
        throw createNotFoundError(filePath);
      }

      return file.content;
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
  test("create initializes persisted dropper JSON", async () => {
    const dataDir = "/data";
    const filesetPath = path.join(dataDir, "filesets", "demo.txt");
    const { deps, files, ensuredDirs } = createMemoryDropperDeps({
      [filesetPath]: "/src/a.ts\n/src/b.ts\n",
    });
    const service = new DefaultDropperService(deps);

    await service.create({
      dataDir,
      filesetName: "demo",
      dropperName: "d1",
    });

    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    expect(ensuredDirs.has(path.join(dataDir, "droppers"))).toBe(true);
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toEqual({
      fileset: "demo",
      pointer_position: 0,
      tags: {},
    });
  });

  test("show returns content of current file", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {},
      }),
      "/src/a.ts": "alpha",
    });
    const service = new DefaultDropperService(deps);

    const content = await service.show({ dataDir, dropperName: "d1" });
    expect(content).toBe("alpha");
  });

  test("next and previous move pointer with boundary errors", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {},
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.next({ dataDir, dropperName: "d1" });
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toMatchObject({
      pointer_position: 1,
    });

    await expect(service.next({ dataDir, dropperName: "d1" })).rejects.toThrow(
      DropperExhaustedError,
    );

    await service.previous({ dataDir, dropperName: "d1" });
    expect(JSON.parse(files.get(dropperPath)?.content ?? "{}")).toMatchObject({
      pointer_position: 0,
    });

    await expect(
      service.previous({ dataDir, dropperName: "d1" }),
    ).rejects.toThrow(DropperAtStartError);
  });

  test("tag dedupes and sorts filenames within each tag", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          z: ["/src/a.ts"],
          a: ["/src/b.ts", "/src/a.ts", "/src/a.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.tag({
      dataDir,
      dropperName: "d1",
      tags: ["z", "b", "a"],
    });

    const persisted = JSON.parse(files.get(dropperPath)?.content ?? "{}");
    expect(persisted.tags).toEqual({
      a: ["/src/a.ts", "/src/b.ts"],
      b: ["/src/a.ts"],
      z: ["/src/a.ts"],
    });
  });

  test("listTags returns sorted tags for current item", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          b: ["/src/a.ts"],
          a: ["/src/a.ts"],
          c: ["/src/b.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    const tags = await service.listTags({ dataDir, dropperName: "d1" });
    expect(tags).toEqual(["a", "b"]);
  });

  test("removeTags deletes current file membership and keeps unrelated tags", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          a: ["/src/a.ts"],
          b: ["/src/b.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    await service.removeTags({
      dataDir,
      dropperName: "d1",
      tags: ["missing", "b", "a"],
    });

    const persisted = JSON.parse(files.get(dropperPath)?.content ?? "{}");
    expect(persisted.tags).toEqual({
      b: ["/src/b.ts"],
    });
  });

  test("listFiles applies no filter, tag OR filter, filename filter, and AND combination", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]:
        "/src/a.ts\n/src/b.ts\n/src/c.ts\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          x: ["/src/a.ts", "/src/b.ts"],
          y: ["/src/c.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    const all = await service.listFiles({ dataDir, dropperName: "d1" });
    expect(all.map((entry) => entry.path)).toEqual([
      "/src/a.ts",
      "/src/b.ts",
      "/src/c.ts",
    ]);

    const byTags = await service.listFiles({
      dataDir,
      dropperName: "d1",
      tags: ["x", "y"],
    });
    expect(byTags.map((entry) => entry.path)).toEqual([
      "/src/a.ts",
      "/src/b.ts",
      "/src/c.ts",
    ]);

    const byFilename = await service.listFiles({
      dataDir,
      dropperName: "d1",
      filename: "/src/b.ts",
    });
    expect(byFilename.map((entry) => entry.path)).toEqual(["/src/b.ts"]);

    const andCombined = await service.listFiles({
      dataDir,
      dropperName: "d1",
      filename: "/src/b.ts",
      tags: ["y"],
    });
    expect(andCombined).toEqual([]);
  });

  test("list retrieves all droppers in the data dir, honoring the fileset filter", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      // Provide valid dropper files
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "f1",
        pointer_position: 0,
        tags: {},
      }),
      [path.join(dataDir, "droppers", "d2.json")]: JSON.stringify({
        fileset: "f2",
        pointer_position: 0,
        tags: {},
      }),
      // Ignore invalid ones
      [path.join(dataDir, "droppers", "broken.json")]: "invalid json",
    });

    // Simulate fs.readdir to be available instead of relying on the system
    deps.readDirFn = async () => [
      "d1.json",
      "d2.json",
      "broken.json",
      "text.txt",
    ];

    const service = new DefaultDropperService(deps);

    const unfiltered = await service.list({ dataDir });
    expect(unfiltered).toEqual(["broken", "d1", "d2"]);

    const filtered1 = await service.list({ dataDir, filesetName: "f1" });
    expect(filtered1).toEqual(["d1"]);

    const filtered2 = await service.list({ dataDir, filesetName: "f2" });
    expect(filtered2).toEqual(["d2"]);

    const filtered3 = await service.list({
      dataDir,
      filesetName: "non-existent",
    });
    expect(filtered3).toEqual([]);
  });

  test("dump materializes dropper record and remove deletes persisted file", async () => {
    const dataDir = "/data";
    const dropperPath = path.join(dataDir, "droppers", "d1.json");
    const { deps, files } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [dropperPath]: JSON.stringify({
        fileset: "demo",
        pointer_position: 1,
        tags: {
          t: ["/src/b.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    const dumped = await service.dump({ dataDir, dropperName: "d1" });
    expect(dumped.name).toBe("d1");
    expect(dumped.filesetName).toBe("demo");
    expect(dumped.pointer).toEqual({ currentIndex: 1, total: 2 });
    expect(dumped.entries).toEqual([
      { path: "/src/a.ts", tags: [] },
      { path: "/src/b.ts", tags: ["t"] },
    ]);

    await service.remove({ dataDir, dropperName: "d1" });
    expect(files.has(dropperPath)).toBe(false);

    await expect(
      service.remove({ dataDir, dropperName: "d1" }),
    ).rejects.toThrow(AppError);
  });

  test("isDone returns true when all files have at least one tag", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]: "/src/a.ts\n/src/b.ts\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          t1: ["/src/a.ts"],
          t2: ["/src/b.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(service.isDone({ dataDir, dropperName: "d1" })).resolves.toBe(
      true,
    );
  });

  test("isDone throws with list of untagged files when incomplete", async () => {
    const dataDir = "/data";
    const { deps } = createMemoryDropperDeps({
      [path.join(dataDir, "filesets", "demo.txt")]:
        "/src/a.ts\n/src/b.ts\n/src/c.ts\n",
      [path.join(dataDir, "droppers", "d1.json")]: JSON.stringify({
        fileset: "demo",
        pointer_position: 0,
        tags: {
          t1: ["/src/a.ts"],
        },
      }),
    });
    const service = new DefaultDropperService(deps);

    await expect(
      service.isDone({ dataDir, dropperName: "d1" }),
    ).rejects.toThrowError("Untagged items remain:\n/src/b.ts\n/src/c.ts");
  });
});
