import path from "node:path";
import { Writable } from "node:stream";
import { describe, expect, test } from "bun:test";
import type { DropperService } from "../dropper/service";
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
} from "../dropper/types";
import { DropperAtStartError, DropperExhaustedError } from "../dropper/errors";
import type { FilesetService } from "../fileset/service";
import type {
  FilesetRecord,
  ImportFilesetInput,
  ListFilesetsInput,
  RemoveFilesetInput,
  ShowFilesetInput,
} from "../fileset/types";
import { AppError } from "../file-utils/errors";
import { runCli, type CliDependencies } from "./app";

class MemoryWritable extends Writable {
  private readonly chunks: string[] = [];

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  override toString(): string {
    return this.chunks.join("");
  }
}

async function runCliWithCapturedOutput(
  argv: string[],
  deps: Omit<CliDependencies, "stdout" | "stderr"> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();

  const exitCode = await runCli(argv, {
    ...deps,
    stdout: stdout as unknown as NodeJS.WritableStream,
    stderr: stderr as unknown as NodeJS.WritableStream,
  });

  return {
    exitCode,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  };
}

function createFilesetService(
  overrides: Partial<FilesetService> = {},
): FilesetService {
  return {
    importFromList: async (_input: ImportFilesetInput) => {},
    list: async (_input: ListFilesetsInput): Promise<FilesetRecord[]> => [],
    show: async (_input: ShowFilesetInput): Promise<FilesetRecord> => {
      return {
        name: "fileset",
        files: [],
        createdAt: "",
        updatedAt: "",
      };
    },
    remove: async (_input: RemoveFilesetInput) => {},
    ...overrides,
  };
}

function createDropperService(
  overrides: Partial<DropperService> = {},
): DropperService {
  return {
    create: async (_input: CreateDropperInput) => {},
    show: async (_input: ShowDropperInput): Promise<string> => "",
    next: async (_input: NextDropperInput) => {},
    previous: async (_input: PreviousDropperInput) => {},
    tag: async (_input: TagDropperInput) => {},
    listTags: async (_input: ListDropperTagsInput): Promise<string[]> => [],
    removeTags: async (_input: RemoveDropperTagsInput) => {},
    list: async (_input: ListDropperInput): Promise<string[]> => [],
    listFiles: async (
      _input: ListFilesDropperInput,
    ): Promise<DropperEntry[]> => [],
    remove: async (_input: RemoveDropperInput) => {},
    dump: async (_input: DumpDropperInput): Promise<DropperRecord> => {
      return {
        name: "dropper",
        filesetName: "fileset",
        entries: [],
        pointer: { currentIndex: null, total: 0 },
        createdAt: "",
        updatedAt: "",
      };
    },
    isDone: async (_input: IsDoneDropperInput): Promise<boolean> => true,
    ...overrides,
  };
}

describe("CLI command skeleton", () => {
  test("no command shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("help exits successfully", async () => {
    const { exitCode } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "--help",
    ]);
    expect(exitCode).toBe(0);
  });

  test("fileset without subcommand shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "fileset",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("dropper without subcommand shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "dropper",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("extract command is not registered", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "extract",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown command");
  });

  test("missing required args returns usage exit code 2", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "dropper",
      "create",
      "demo",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing required argument: fileset");
  });

  test("strict dropper name validation is enforced", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "dropper",
        "create",
        "bad name",
        "--fileset",
        "ok-fileset",
      ],
      {
        dropperService: createDropperService(),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid dropper name: bad name");
  });

  test("dropper list-files parses tags and normalized filename", async () => {
    let listInput: ListFilesDropperInput | undefined;
    const cwd = process.cwd();
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "dropper",
        "list-files",
        "demo",
        "--tag",
        "alpha",
        "--tag",
        "beta",
        "--filename",
        "./README.md",
      ],
      {
        cwd,
        dropperService: createDropperService({
          listFiles: async (
            input: ListFilesDropperInput,
          ): Promise<DropperEntry[]> => {
            listInput = input;
            return [];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(listInput).toBeDefined();
    expect(listInput?.dropperName).toBe("demo");
    expect(listInput?.tags).toEqual(["alpha", "beta"]);
    expect(listInput?.filename).toBe(path.resolve(cwd, "README.md"));
    expect(listInput?.dataDir).toBe(path.resolve(cwd, ".context-dropper"));
  });

  test("fileset list prints one fileset name per line", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "fileset", "list"],
      {
        filesetService: createFilesetService({
          list: async (): Promise<FilesetRecord[]> => {
            return [
              { name: "alpha", files: [], createdAt: "", updatedAt: "" },
              { name: "beta", files: [], createdAt: "", updatedAt: "" },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("alpha\nbeta\n");
  });

  test("fileset show prints one file path per line", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "fileset", "show", "demo"],
      {
        filesetService: createFilesetService({
          show: async (): Promise<FilesetRecord> => {
            return {
              name: "demo",
              files: ["/src/a.ts", "/src/b.ts"],
              createdAt: "",
              updatedAt: "",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("/src/a.ts\n/src/b.ts\n");
  });

  test("fileset import resolves list entries relative to list file directory", async () => {
    const listFile = "./test-fixtures/files.txt";
    const normalizedListFilePath = path.resolve(process.cwd(), listFile);
    const normalizedEntries = ["/abs/source/a.txt", "/abs/source/b.txt"];
    let seamCalledWith: string | undefined;

    let importInput: ImportFilesetInput | undefined;
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "fileset",
        "import",
        "--name",
        "sample",
        listFile,
      ],
      {
        readAndValidateFilesetEntriesFn: async (
          listFilePath: string,
        ): Promise<string[]> => {
          seamCalledWith = listFilePath;
          return normalizedEntries;
        },
        filesetService: createFilesetService({
          importFromList: async (input: ImportFilesetInput): Promise<void> => {
            importInput = input;
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(seamCalledWith).toBe(normalizedListFilePath);
    expect(importInput).toBeDefined();
    expect(importInput?.listFilePath).toBe(normalizedListFilePath);
    expect(importInput?.normalizedFilePaths).toEqual(normalizedEntries);
    expect(stdout).toBe("");
  });

  test("dropper show maps exhausted state to exit code 3", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "show", "demo"],
      {
        dropperService: createDropperService({
          show: async (_input: ShowDropperInput): Promise<string> => {
            throw new DropperExhaustedError();
          },
        }),
      },
    );

    expect(exitCode).toBe(3);
    expect(stderr).toContain("No file left in dropper");
  });

  test("dropper previous maps at-start state to exit code 4", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "previous", "demo"],
      {
        dropperService: createDropperService({
          previous: async (_input: PreviousDropperInput): Promise<void> => {
            throw new DropperAtStartError();
          },
        }),
      },
    );

    expect(exitCode).toBe(4);
    expect(stderr).toContain("Dropper is already at the first item");
  });

  test("dropper show prints content and appends trailing newline", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "show", "demo"],
      {
        dropperService: createDropperService({
          show: async (): Promise<string> => {
            return "hello world";
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("hello world\n");
  });

  test("dropper list-files prints path only for each entry", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "list-files", "demo"],
      {
        dropperService: createDropperService({
          listFiles: async (): Promise<DropperEntry[]> => {
            return [
              { path: "/src/a.ts", tags: ["x"] },
              { path: "/src/b.ts", tags: [] },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("/src/a.ts\n/src/b.ts\n");
  });

  test("dropper list prints valid droppers with an optional fileset filter", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "list", "--fileset", "f1"],
      {
        dropperService: createDropperService({
          list: async (): Promise<string[]> => {
            return ["d1", "d2"];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("d1\nd2\n");
  });

  test("dropper list-tags prints one tag per line", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "list-tags", "demo"],
      {
        dropperService: createDropperService({
          listTags: async (): Promise<string[]> => {
            return ["alpha", "beta"];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("alpha\nbeta\n");
  });

  test("dropper dump prints pretty JSON", async () => {
    const dumpRecord: DropperRecord = {
      name: "demo",
      filesetName: "main",
      entries: [{ path: "/src/a.ts", tags: ["alpha"] }],
      pointer: { currentIndex: 0, total: 1 },
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "dump", "demo"],
      {
        dropperService: createDropperService({
          dump: async (): Promise<DropperRecord> => {
            return dumpRecord;
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(`${JSON.stringify(dumpRecord, null, 2)}\n`);
  });

  test("write/move commands stay silent on stdout", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "next", "demo"],
      {
        dropperService: createDropperService(),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  test("dropper is-done prints true and exits 0 when complete", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "is-done", "demo"],
      {
        dropperService: createDropperService({
          isDone: async (): Promise<boolean> => true,
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("true\n");
    expect(stderr).toBe("");
  });

  test("dropper is-done exits non-zero and prints untagged files on stderr", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "is-done", "demo"],
      {
        dropperService: createDropperService({
          isDone: async (): Promise<boolean> => {
            throw new AppError("Untagged items remain:\n/src/a.ts\n/src/b.ts");
          },
        }),
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Untagged items remain:");
    expect(stderr).toContain("/src/a.ts");
    expect(stderr).toContain("/src/b.ts");
  });
});
