import path from "node:path";
import { Writable } from "node:stream";
import { describe, expect, test } from "bun:test";
import type { DropperService } from "../dropper/service";
import type {
  CreateDropperInput,
  DropperEntry,
  DropperRecord,
  DumpDropperInput,
  ListDropperInput,
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
    list: async (_input: ListDropperInput): Promise<DropperEntry[]> => [],
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
    ...overrides,
  };
}

describe("CLI command skeleton", () => {
  test("no command shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("help exits successfully", async () => {
    const { exitCode } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
      "--help",
    ]);
    expect(exitCode).toBe(0);
  });

  test("fileset without subcommand shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
      "fileset",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("dropper without subcommand shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
      "dropper",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("extract command is not registered", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
      "extract",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown command");
  });

  test("missing required args returns usage exit code 2", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-eyedropper",
      "dropper",
      "create",
      "demo",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing required argument: fileset");
  });

  test("strict dropper name validation is enforced", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-eyedropper",
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

  test("dropper list parses tags and normalized filename", async () => {
    let listInput: ListDropperInput | undefined;
    const cwd = process.cwd();
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-eyedropper",
        "dropper",
        "list",
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
          list: async (input: ListDropperInput): Promise<DropperEntry[]> => {
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
    expect(listInput?.dataDir).toBe(path.resolve(cwd, ".context-eyedropper"));
  });

  test("fileset import resolves list entries relative to list file directory", async () => {
    const listFile = "./test-fixtures/files.txt";
    const normalizedListFilePath = path.resolve(process.cwd(), listFile);
    const normalizedEntries = ["/abs/source/a.txt", "/abs/source/b.txt"];
    let seamCalledWith: string | undefined;

    let importInput: ImportFilesetInput | undefined;
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-eyedropper",
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
  });

  test("dropper show maps exhausted state to exit code 3", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-eyedropper", "dropper", "show", "demo"],
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
      ["bun", "context-eyedropper", "dropper", "previous", "demo"],
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
});
