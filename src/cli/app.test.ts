import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Writable } from "node:stream";
import { DropperAtStartError, DropperExhaustedError } from "../dropper/errors";
import type { DropperService } from "../dropper/service";
import type {
  CreateDropperInput,
  IsDoneDropperInput,
  ListDropperInput,
  ListFilesDropperInput,
  NextDropperInput,
  PreviousDropperInput,
  RemoveDropperInput,
  ShowTaskPromptInput,
} from "../dropper/types";
import { AppError } from "../file-utils/errors";
import type { FilesetService } from "../fileset/service";
import type {
  FilesetRecord,
  ImportFilesetInput,
  ListFilesetsInput,
  RemoveFilesetInput,
  ShowFilesetInput,
} from "../fileset/types";
import type { InitService, InitTargetInput, InitTargetResult } from "./init/service";
import type { TaskService } from "../task/service";
import type {
  CreateTaskInput,
  ListTasksInput,
  RemoveTaskInput,
  ShowTaskInput,
  TaskRecord,
  UpdateTaskInput,
} from "../task/types";
import { type CliDependencies, runCli } from "./app";

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

function createTaskService(overrides: Partial<TaskService> = {}): TaskService {
  return {
    create: async (_input: CreateTaskInput) => {},
    update: async (_input: UpdateTaskInput) => {},
    show: async (_input: ShowTaskInput): Promise<TaskRecord> => {
      return {
        name: "task",
        content: "",
        createdAt: "",
        updatedAt: "",
      };
    },
    list: async (_input: ListTasksInput): Promise<TaskRecord[]> => [],
    remove: async (_input: RemoveTaskInput) => {},
    ...overrides,
  };
}

function createDropperService(
  overrides: Partial<DropperService> = {},
): DropperService {
  return {
    create: async (_input: CreateDropperInput) => {},
    showTaskPrompt: async (_input: ShowTaskPromptInput): Promise<string> => "",
    next: async (_input: NextDropperInput) => {},
    previous: async (_input: PreviousDropperInput) => {},
    list: async (_input: ListDropperInput): Promise<string[]> => [],
    listFiles: async (_input: ListFilesDropperInput): Promise<string[]> => [],
    remove: async (_input: RemoveDropperInput) => {},
    isDone: async (_input: IsDoneDropperInput): Promise<boolean> => false,
    ...overrides,
  };
}

function createInitService(overrides: Partial<InitService> = {}): InitService {
  return {
    listTargets: (): ("codex" | "opencode")[] => ["codex", "opencode"],
    init: async (_input: InitTargetInput): Promise<InitTargetResult> => {
      return {
        target: "opencode",
        configPath: "/repo/opencode.jsonc",
        writtenFiles: ["/repo/opencode.jsonc"],
      };
    },
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

  test("task without subcommand shows usage and exits successfully", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "task",
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

  test("init without target returns usage exit code", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "init",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Not enough non-option arguments");
  });

  test("missing required dropper args returns usage exit code 2", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "dropper",
      "create",
      "demo",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing required arguments: fileset, task");
  });

  test("strict task name validation is enforced", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "task",
        "show",
        "bad name",
      ],
      {
        taskService: createTaskService(),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid task name: bad name");
  });

  test("dropper create passes fileset and task to the service", async () => {
    let createInput: CreateDropperInput | undefined;
    const cwd = process.cwd();
    const { exitCode } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "dropper",
        "create",
        "demo",
        "--fileset",
        "tracked",
        "--task",
        "review-auth",
      ],
      {
        cwd,
        dropperService: createDropperService({
          create: async (input: CreateDropperInput): Promise<void> => {
            createInput = input;
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(createInput).toEqual({
      dataDir: path.resolve(cwd, ".context-dropper"),
      filesetName: "tracked",
      taskName: "review-auth",
      dropperName: "demo",
    });
  });

  test("dropper list-files parses pending status", async () => {
    let listInput: ListFilesDropperInput | undefined;
    const cwd = process.cwd();
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "dropper",
        "list-files",
        "demo",
        "--pending",
      ],
      {
        cwd,
        dropperService: createDropperService({
          listFiles: async (input: ListFilesDropperInput): Promise<string[]> => {
            listInput = input;
            return [];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(listInput).toEqual({
      dataDir: path.resolve(cwd, ".context-dropper"),
      dropperName: "demo",
      status: "pending",
    });
  });

  test("dropper show-task-prompt prints generated prompt", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "show-task-prompt", "demo"],
      {
        dropperService: createDropperService({
          showTaskPrompt: async (): Promise<string> => {
            return "STATUS: SUCCESS\n";
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("STATUS: SUCCESS\n");
  });

  test("dropper is-done prints boolean output", async () => {
    const { exitCode, stdout } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "is-done", "demo"],
      {
        dropperService: createDropperService({
          isDone: async (): Promise<boolean> => true,
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("true\n");
  });

  test("task list prints one task name per line", async () => {
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "task", "list"],
      {
        taskService: createTaskService({
          list: async (): Promise<TaskRecord[]> => {
            return [
              { name: "alpha", content: "", createdAt: "", updatedAt: "" },
              { name: "beta", content: "", createdAt: "", updatedAt: "" },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("alpha\nbeta\n");
  });

  test("task show prints raw markdown content", async () => {
    const { exitCode, stdout } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "task", "show", "review-auth"],
      {
        taskService: createTaskService({
          show: async (): Promise<TaskRecord> => {
            return {
              name: "review-auth",
              content: "# Review\n\nDetails\n",
              createdAt: "",
              updatedAt: "",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("# Review\n\nDetails\n");
  });

  test("init opencode passes worker model overrides to the init service", async () => {
    let initInput: InitTargetInput | undefined;
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "init",
        "opencode",
        "--worker-model",
        "openai/gpt-5-mini",
      ],
      {
        cwd: "/repo",
        initService: createInitService({
          init: async (input: InitTargetInput): Promise<InitTargetResult> => {
            initInput = input;
            return {
              target: "opencode",
              configPath: "/repo/opencode.jsonc",
              writtenFiles: ["/repo/opencode.jsonc"],
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(initInput).toEqual({
      cwd: "/repo",
      target: "opencode",
      workerModel: "openai/gpt-5-mini",
      workerReasoningEffort: undefined,
    });
    expect(stdout).toContain("Initialized opencode scaffold in /repo");
  });

  test("init opencode passes reasoning overrides to the init service", async () => {
    let initInput: InitTargetInput | undefined;
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "init",
        "opencode",
        "--worker-reasoning-effort",
        "medium",
      ],
      {
        cwd: "/repo",
        initService: createInitService({
          init: async (input: InitTargetInput): Promise<InitTargetResult> => {
            initInput = input;
            return {
              target: "opencode",
              configPath: "/repo/opencode.jsonc",
              writtenFiles: ["/repo/opencode.jsonc"],
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(initInput).toEqual({
      cwd: "/repo",
      target: "opencode",
      workerModel: undefined,
      workerReasoningEffort: "medium",
    });
    expect(stdout).toContain("Initialized opencode scaffold in /repo");
  });

  test("init codex passes worker model and reasoning overrides to the init service", async () => {
    let initInput: InitTargetInput | undefined;
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      [
        "bun",
        "context-dropper",
        "init",
        "codex",
        "--worker-model",
        "gpt-5.4-mini",
        "--worker-reasoning-effort",
        "medium",
      ],
      {
        cwd: "/repo",
        initService: createInitService({
          init: async (input: InitTargetInput): Promise<InitTargetResult> => {
            initInput = input;
            return {
              target: "codex",
              configPath: "/repo/.codex/agents/context-dropper-worker.toml",
              writtenFiles: ["/repo/.codex/agents/context-dropper-worker.toml"],
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(initInput).toEqual({
      cwd: "/repo",
      target: "codex",
      workerModel: "gpt-5.4-mini",
      workerReasoningEffort: "medium",
    });
    expect(stdout).toContain("Initialized codex scaffold in /repo");
  });

  test("init help exposes supported targets", async () => {
    const { exitCode, stdout } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "init",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("codex");
    expect(stdout).toContain("opencode");
  });

  test("init codex passes the target to the init service", async () => {
    let initInput: InitTargetInput | undefined;
    const { exitCode, stdout, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "init", "codex"],
      {
        cwd: "/repo",
        initService: createInitService({
          init: async (input: InitTargetInput): Promise<InitTargetResult> => {
            initInput = input;
            return {
              target: "codex",
              configPath: "/repo/.codex/agents/context-dropper-worker.toml",
              writtenFiles: ["/repo/.codex/agents/context-dropper-worker.toml"],
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(initInput).toEqual({
      cwd: "/repo",
      target: "codex",
      workerModel: undefined,
      workerReasoningEffort: undefined,
    });
    expect(stdout).toContain("Initialized codex scaffold in /repo");
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

  test("dropper exhausted error maps to exit code 3", async () => {
    const { exitCode } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "next", "demo"],
      {
        dropperService: createDropperService({
          next: async (): Promise<void> => {
            throw new DropperExhaustedError();
          },
        }),
      },
    );
    expect(exitCode).toBe(3);
  });

  test("dropper at start error maps to exit code 4", async () => {
    const { exitCode } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "previous", "demo"],
      {
        dropperService: createDropperService({
          previous: async (): Promise<void> => {
            throw new DropperAtStartError();
          },
        }),
      },
    );
    expect(exitCode).toBe(4);
  });

  test("removed dropper commands are rejected", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput([
      "bun",
      "context-dropper",
      "dropper",
      "tag",
      "demo",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown command");
  });

  test("application errors remain exit code 1", async () => {
    const { exitCode, stderr } = await runCliWithCapturedOutput(
      ["bun", "context-dropper", "dropper", "show-task-prompt", "demo"],
      {
        dropperService: createDropperService({
          showTaskPrompt: async (): Promise<string> => {
            throw new AppError("boom");
          },
        }),
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("boom");
  });
});
