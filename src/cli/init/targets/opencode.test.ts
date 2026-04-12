import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AppError } from "../../../file-utils/errors";
import {
  DefaultOpenCodeInitTarget,
  type OpenCodeInitTargetDeps,
} from "./opencode";

class MemoryFs {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [filePath, content] of Object.entries(initialFiles)) {
      this.files.set(filePath, content);
    }
  }

  createDeps(): OpenCodeInitTargetDeps {
    return {
      ensureDirFn: async (directoryPath: string): Promise<void> => {
        this.directories.add(directoryPath);
      },
      fileExistsFn: async (filePath: string): Promise<boolean> => {
        return this.files.has(filePath);
      },
      readTextFileFn: async (filePath: string): Promise<string> => {
        const content = this.files.get(filePath);
        if (content === undefined) {
          throw new Error(`Missing file in test fs: ${filePath}`);
        }

        return content;
      },
      writeTextFileFn: async (
        filePath: string,
        content: string,
      ): Promise<void> => {
        this.files.set(filePath, content);
      },
    };
  }
}

function parseConfig(fs: MemoryFs, filePath: string): Record<string, unknown> {
  const content = fs.files.get(filePath);
  if (content === undefined) {
    throw new Error(`Expected config to exist: ${filePath}`);
  }

  return JSON.parse(content) as Record<string, unknown>;
}

function getObject(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  expect(value).toBeDefined();
  return value as Record<string, unknown>;
}

describe("DefaultOpenCodeInitTarget", () => {
  test("initializes a fresh scaffold with generated files", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeInitTarget(fs.createDeps());
    const cwd = "/repo";

    const result = await service.init({ cwd });

    expect(result.configPath).toBe("/repo/opencode.jsonc");
    expect(result.writtenFiles).toEqual([
      "/repo/.opencode/commands/context-dropper-create.md",
      "/repo/.opencode/commands/context-dropper-loop.md",
      "/repo/.opencode/commands/context-dropper-reset.md",
      "/repo/.opencode/commands/context-dropper-status.md",
      "/repo/.opencode/prompts/context-dropper-worker.md",
      "/repo/opencode.jsonc",
    ]);

    const config = parseConfig(fs, "/repo/opencode.jsonc");
    expect(config.$schema).toBe("https://opencode.ai/config.json");

    const agent = config.agent as Record<string, Record<string, unknown>>;
    const worker = getObject(
      agent as Record<string, unknown>,
      "context-dropper-worker",
    );

    const workerTools = getObject(worker, "tools") as Record<string, unknown>;
    expect(workerTools.task).toBe(false);

    const runCommand = fs.files.get(
      "/repo/.opencode/commands/context-dropper-loop.md",
    );
    expect(runCommand).toContain("Use the current OpenCode chat as the controller");
    expect(runCommand).toContain("show-task-prompt $1");
    expect(runCommand).toContain("The loop is strictly sequential.");
    expect(runCommand).toContain("Follow these steps exactly until the dropper is done.");
    expect(runCommand).toContain("Explicitly close each worker subagent after it finishes");
    expect(runCommand).toContain(
      "Never run `next`, `is-done`, or `show-task-prompt` in parallel",
    );
    expect(runCommand).toContain(
      "Spawn a brand-new `context-dropper-worker` subagent for every file.",
    );
    expect(runCommand).toContain("Wait for that worker to finish, then explicitly close it.");
    expect(runCommand).toContain("`/context-dropper-loop <dropperName>`");
    expect(runCommand).not.toContain("agent:");

    const createCommand = fs.files.get(
      "/repo/.opencode/commands/context-dropper-create.md",
    );
    expect(createCommand).toContain("Use the current OpenCode chat as the controller");
    expect(createCommand).toContain("Derive the dropper name as `opencode-$1`.");
    expect(createCommand).toContain("`/context-dropper-create <fileset> <taskName>`");

    const resetCommand = fs.files.get(
      "/repo/.opencode/commands/context-dropper-reset.md",
    );
    expect(resetCommand).toContain("Run `context-dropper dropper previous $1`");
    expect(resetCommand).toContain("`/context-dropper-reset <dropperName>`");

    const statusCommand = fs.files.get(
      "/repo/.opencode/commands/context-dropper-status.md",
    );
    expect(statusCommand).toContain("Run `context-dropper dropper list-files $1 --pending`.");
    expect(statusCommand).toContain("`/context-dropper-status <dropperName>`");

    const workerPrompt = fs.files.get(
      "/repo/.opencode/prompts/context-dropper-worker.md",
    );
    expect(workerPrompt).toContain(
      "The generated prompt is intentionally thin. Treat this worker prompt as the stable behavior contract.",
    );
    expect(workerPrompt).toContain(
      "You are single-use. Finish one file and stop; do not expect to be reused for later files.",
    );
    expect(workerPrompt).toContain(
      "Your final response must be exactly one line: `STATUS: SUCCESS` or `STATUS: FAILURE`.",
    );
  });

  test("writes model overrides only when explicit flags are provided", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeInitTarget(fs.createDeps());

    await service.init({
      cwd: "/repo",
      workerModel: "openai/gpt-5-mini",
    });

    const config = parseConfig(fs, "/repo/opencode.jsonc");
    const agent = config.agent as Record<string, Record<string, unknown>>;
    const worker = getObject(
      agent as Record<string, unknown>,
      "context-dropper-worker",
    );

    expect(worker.model).toBe("openai/gpt-5-mini");
  });

  test("writes reasoning overrides only when explicit flags are provided", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeInitTarget(fs.createDeps());

    await service.init({
      cwd: "/repo",
      workerReasoningEffort: "medium",
    });

    const config = parseConfig(fs, "/repo/opencode.jsonc");
    const agent = config.agent as Record<string, Record<string, unknown>>;
    const worker = getObject(
      agent as Record<string, unknown>,
      "context-dropper-worker",
    );

    expect(worker.reasoningEffort).toBe("medium");
  });

  test("fails when both opencode.json and opencode.jsonc exist", async () => {
    const cwd = "/repo";
    const fs = new MemoryFs({
      [path.join(cwd, "opencode.json")]: "{}\n",
      [path.join(cwd, "opencode.jsonc")]: "{}\n",
    });
    const service = new DefaultOpenCodeInitTarget(fs.createDeps());

    await expect(service.init({ cwd })).rejects.toThrow(
      new AppError(
        "Cannot initialize OpenCode scaffold: both opencode.json and opencode.jsonc exist",
      ),
    );
  });
});
