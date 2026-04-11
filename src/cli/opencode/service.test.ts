import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parse } from "jsonc-parser";
import { AppError } from "../../file-utils/errors";
import {
  DefaultOpenCodeScaffoldService,
  type OpenCodeScaffoldServiceDeps,
} from "./service";

class MemoryFs {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [filePath, content] of Object.entries(initialFiles)) {
      this.files.set(filePath, content);
    }
  }

  createDeps(): OpenCodeScaffoldServiceDeps {
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

  return parse(content, [], {
    allowTrailingComma: true,
  }) as Record<string, unknown>;
}

function getObject(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  expect(value).toBeDefined();
  return value as Record<string, unknown>;
}

describe("DefaultOpenCodeScaffoldService", () => {
  test("initializes a fresh scaffold with generated files", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());
    const cwd = "/repo";

    const result = await service.init({ cwd });

    expect(result.configPath).toBe("/repo/opencode.jsonc");
    expect(result.writtenFiles).toEqual([
      "/repo/opencode.jsonc",
      "/repo/.opencode/commands/context-dropper-reset.md",
      "/repo/.opencode/commands/context-dropper-status.md",
      "/repo/.opencode/commands/context-dropper.md",
      "/repo/.opencode/prompts/context-dropper-controller.md",
      "/repo/.opencode/prompts/context-dropper-worker.md",
    ]);

    const config = parseConfig(fs, "/repo/opencode.jsonc");
    expect(config.$schema).toBe("https://opencode.ai/config.json");

    const agent = config.agent as Record<string, Record<string, unknown>>;
    const controller = getObject(agent as Record<string, unknown>, "context-dropper-controller");
    const worker = getObject(agent as Record<string, unknown>, "context-dropper-worker");

    expect(controller.prompt).toBe(
      "{file:.opencode/prompts/context-dropper-controller.md}",
    );
    const controllerPermission = getObject(
      controller,
      "permission",
    ) as Record<string, unknown>;
    const taskPermission = getObject(
      controllerPermission,
      "task",
    ) as Record<string, unknown>;
    expect(taskPermission["context-dropper-worker"]).toBe("allow");
    expect(worker.hidden).toBe(true);
    expect("model" in controller).toBe(false);
    expect("model" in worker).toBe(false);

    const command = fs.files.get("/repo/.opencode/commands/context-dropper.md");
    expect(command).toContain("agent: context-dropper-controller");
    expect(command).toContain("subtask: true");
    expect(command).toContain("<fileset>$1</fileset>");
    expect(command).toContain("<task>$2</task>");
  });

  test("merges generated agents into an existing opencode.jsonc file", async () => {
    const cwd = "/repo";
    const configPath = path.join(cwd, "opencode.jsonc");
    const fs = new MemoryFs({
      [configPath]: `{
  // keep this config
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": {
    "existing": {
      "mode": "primary"
    }
  }
}
`,
    });
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());

    await service.init({ cwd });

    const config = parseConfig(fs, configPath);
    expect(config.model).toBe("anthropic/claude-sonnet-4-20250514");

    const agent = config.agent as Record<string, Record<string, unknown>>;
    const existing = getObject(agent as Record<string, unknown>, "existing");
    const controller = getObject(agent as Record<string, unknown>, "context-dropper-controller");
    const worker = getObject(agent as Record<string, unknown>, "context-dropper-worker");

    expect(existing.mode).toBe("primary");
    expect("model" in controller).toBe(false);
    expect("model" in worker).toBe(false);
  });

  test("updates an existing opencode.json file when jsonc is absent", async () => {
    const cwd = "/repo";
    const configPath = path.join(cwd, "opencode.json");
    const fs = new MemoryFs({
      [configPath]: `{
  "share": "auto"
}
`,
    });
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());

    const result = await service.init({ cwd });

    expect(result.configPath).toBe(configPath);
    const config = parseConfig(fs, configPath);
    expect(config.share).toBe("auto");
    expect(config.agent).toBeDefined();
  });

  test("reruns deterministically for scaffold-owned files", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());
    const cwd = "/repo";

    await service.init({ cwd });
    const firstSnapshot = new Map(fs.files);

    await service.init({ cwd });

    expect(fs.files).toEqual(firstSnapshot);
  });

  test("fails when both opencode.json and opencode.jsonc exist", async () => {
    const cwd = "/repo";
    const fs = new MemoryFs({
      [path.join(cwd, "opencode.json")]: "{}\n",
      [path.join(cwd, "opencode.jsonc")]: "{}\n",
    });
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());

    await expect(service.init({ cwd })).rejects.toThrow(
      new AppError(
        "Cannot initialize OpenCode scaffold: both opencode.json and opencode.jsonc exist",
      ),
    );
  });

  test("writes model overrides only when explicit flags are provided", async () => {
    const fs = new MemoryFs();
    const service = new DefaultOpenCodeScaffoldService(fs.createDeps());

    await service.init({
      cwd: "/repo",
      controllerModel: "openai/gpt-5",
      workerModel: "openai/gpt-5-mini",
    });

    const config = parseConfig(fs, "/repo/opencode.jsonc");
    const agent = config.agent as Record<string, Record<string, unknown>>;
    const controller = getObject(agent as Record<string, unknown>, "context-dropper-controller");
    const worker = getObject(agent as Record<string, unknown>, "context-dropper-worker");

    expect(controller.model).toBe("openai/gpt-5");
    expect(worker.model).toBe("openai/gpt-5-mini");
  });
});
