import { describe, expect, test } from "bun:test";
import {
  DefaultCodexInitTarget,
  type CodexInitTargetDeps,
} from "./codex";

class MemoryFs {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [filePath, content] of Object.entries(initialFiles)) {
      this.files.set(filePath, content);
    }
  }

  createDeps(): CodexInitTargetDeps {
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

describe("DefaultCodexInitTarget", () => {
  test("initializes a fresh codex scaffold with agents and skills", async () => {
    const fs = new MemoryFs();
    const service = new DefaultCodexInitTarget(fs.createDeps());

    const result = await service.init({ cwd: "/repo" });

    expect(result.configPath).toBe("/repo/.codex/agents/context-dropper-worker.toml");
    expect(result.writtenFiles).toEqual([
      "/repo/.agents/skills/context-dropper-create/SKILL.md",
      "/repo/.agents/skills/context-dropper-loop/SKILL.md",
      "/repo/.agents/skills/context-dropper-reset/SKILL.md",
      "/repo/.agents/skills/context-dropper-status/SKILL.md",
      "/repo/.codex/agents/context-dropper-worker.toml",
    ]);

    const loopSkill = fs.files.get(
      "/repo/.agents/skills/context-dropper-loop/SKILL.md",
    );
    expect(loopSkill).toContain("name: context-dropper-loop");
    expect(loopSkill).toContain("Use the current Codex chat as the controller.");
    expect(loopSkill).toContain("Spawn the `context_dropper_worker` custom agent");
    expect(loopSkill).toContain("The loop is strictly sequential.");
    expect(loopSkill).toContain("Follow these steps exactly until the dropper is done.");
    expect(loopSkill).toContain("Explicitly close each worker agent after it finishes");
    expect(loopSkill).toContain(
      "Never run `next`, `is-done`, or `show-task-prompt` in parallel",
    );
    expect(loopSkill).toContain(
      "Spawn a brand-new `context_dropper_worker` agent for every file.",
    );
    expect(loopSkill).toContain("Wait for that worker to finish, then explicitly close it.");

    const worker = fs.files.get(
      "/repo/.codex/agents/context-dropper-worker.toml",
    );
    expect(worker).toContain('name = "context_dropper_worker"');
    expect(worker).toContain("Handle exactly one file");
    expect(worker).toContain(
      "You are single-use. Finish one file and stop; do not expect to be reused for later files.",
    );
    expect(worker).toContain("Do not create, inspect, advance, reset");
  });

  test("writes model overrides only when explicit flags are provided", async () => {
    const fs = new MemoryFs();
    const service = new DefaultCodexInitTarget(fs.createDeps());

    await service.init({
      cwd: "/repo",
      workerModel: "gpt-5.4-mini",
    });

    const worker = fs.files.get(
      "/repo/.codex/agents/context-dropper-worker.toml",
    );
    expect(worker).toContain('model = "gpt-5.4-mini"');
  });

  test("writes reasoning overrides only when explicit flags are provided", async () => {
    const fs = new MemoryFs();
    const service = new DefaultCodexInitTarget(fs.createDeps());

    await service.init({
      cwd: "/repo",
      workerReasoningEffort: "medium",
    });

    const worker = fs.files.get(
      "/repo/.codex/agents/context-dropper-worker.toml",
    );
    expect(worker).toContain('model_reasoning_effort = "medium"');
  });
});
