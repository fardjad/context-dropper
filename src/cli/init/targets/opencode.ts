import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseJSONC, stringifyJSONC } from "confbox";
import { AppError } from "../../../file-utils/errors";

const OPEN_CODE_SCHEMA_URL = "https://opencode.ai/config.json";
const WORKER_AGENT_NAME = "context-dropper-worker";

type JsonObject = Record<string, unknown>;

export type OpenCodeInitTargetInput = {
  cwd: string;
  workerModel?: string;
  workerReasoningEffort?: string;
};

export type OpenCodeInitTargetResult = {
  configPath: string;
  writtenFiles: string[];
};

export interface OpenCodeInitTarget {
  init(input: OpenCodeInitTargetInput): Promise<OpenCodeInitTargetResult>;
}

export type OpenCodeInitTargetDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  readTextFileFn: (filePath: string) => Promise<string>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
};

export const defaultOpenCodeInitTargetDeps: OpenCodeInitTargetDeps = {
  ensureDirFn: async (directoryPath: string): Promise<void> => {
    await mkdir(directoryPath, { recursive: true });
  },
  fileExistsFn: async (filePath: string): Promise<boolean> => {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  readTextFileFn: async (filePath: string): Promise<string> => {
    return await readFile(filePath, "utf-8");
  },
  writeTextFileFn: async (filePath: string, content: string): Promise<void> => {
    await writeFile(filePath, content, "utf-8");
  },
};

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(`Invalid OpenCode config in ${label}`);
  }

  return value as JsonObject;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function parseConfigDocument(content: string, filePath: string): JsonObject {
  if (content.trim().length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseJSONC(content);
  } catch {
    throw new AppError(`Invalid OpenCode config: ${filePath}`);
  }

  return asObject(parsed, filePath);
}

function buildWorkerAgent(model: string, reasoningEffort: string): JsonObject {
  const agent: JsonObject = {
    description: "Handles one file at a time for a context-dropper loop",
    mode: "subagent",
    hidden: true,
    prompt: "{file:.opencode/prompts/context-dropper-worker.md}",
    tools: {
      bash: true,
      task: false,
      read: true,
      glob: true,
      grep: true,
      edit: true,
      write: true,
      webfetch: true,
    },
    permission: {
      bash: "allow",
      edit: "allow",
      webfetch: "allow",
      task: {
        "*": "deny",
      },
    },
  };

  if (model.length > 0) {
    agent.model = model;
  }
  if (reasoningEffort.length > 0) {
    agent.reasoningEffort = reasoningEffort;
  }

  return agent;
}

function buildContextDropperCommandTemplate(): string {
  return [
    "---",
    "description: Run an existing context-dropper loop using a worker subagent",
    "---",
    "",
    "Use the current OpenCode chat as the controller for this loop.",
    "The loop is strictly sequential.",
    "- Follow these steps exactly until the dropper is done.",
    "- Wait for each worker to finish before running any more dropper commands.",
    "- Explicitly close each worker subagent after it finishes before advancing to the next file.",
    "- Never run `next`, `is-done`, or `show-task-prompt` in parallel with each other.",
    "- After a worker succeeds, run `next` first, then fetch the next prompt from the updated pointer state.",
    `- Spawn a brand-new \`${WORKER_AGENT_NAME}\` subagent for every file. Do not reuse a worker across iterations.`,
    "- Do not optimize the loop by batching files, overlapping work, or keeping a worker alive across files.",
    "",
    "Steps:",
    "1. Validate that `$1` is present. If not, stop and tell the user to run `/context-dropper-loop <dropperName>`.",
    "2. Run `context-dropper dropper is-done $1`.",
    "3. If it prints `true`, stop and summarize completion briefly.",
    "4. Run `context-dropper dropper show-task-prompt $1`.",
    `5. Invoke the \`${WORKER_AGENT_NAME}\` subagent with that exact prompt unchanged.`,
    "6. Wait for that worker to finish, then explicitly close it.",
    "7. If the worker does not start with `STATUS: SUCCESS`, stop immediately and report the worker output.",
    "8. Run `context-dropper dropper next $1`.",
    "9. Repeat until the dropper is done.",
    "",
  ].join("\n");
}

function buildCreateCommandTemplate(): string {
  return [
    "---",
    "description: Create an OpenCode context-dropper from an existing fileset and task",
    "---",
    "",
    "Use the current OpenCode chat as the controller for dropper creation.",
    "",
    "Steps:",
    "1. Validate that both `$1` and `$2` are present. If not, stop and tell the user to run `/context-dropper-create <fileset> <taskName>`.",
    "2. Treat `$2` as an existing stored task name, not raw task text.",
    "3. Derive the dropper name as `opencode-$1`.",
    "4. Verify the fileset exists with `context-dropper fileset show $1`.",
    "5. Verify the task exists with `context-dropper task show $2`.",
    "6. Run `context-dropper dropper create --fileset $1 --task $2 <dropperName>`.",
    "7. If the dropper already exists, stop and tell the user to run `/context-dropper-loop <dropperName>`.",
    "8. On success, reply with the created dropper name and tell the user to run `/context-dropper-loop <dropperName>`.",
    "",
  ].join("\n");
}

function buildStatusCommandTemplate(): string {
  return [
    "---",
    "description: Inspect the current OpenCode context-dropper loop state",
    "---",
    "",
    "Use the current OpenCode chat as the controller for status inspection.",
    "Run the status commands sequentially so the reported state comes from one consistent point in time.",
    "",
    "Steps:",
    "1. Validate that `$1` is present. If not, stop and tell the user to run `/context-dropper-status <dropperName>`.",
    "2. Run `context-dropper dropper is-done $1`.",
    "3. Run `context-dropper dropper list-files $1 --done`.",
    "4. Run `context-dropper dropper list-files $1 --pending`.",
    "5. Summarize whether the dropper is done and which files remain pending.",
    "",
  ].join("\n");
}

function buildResetCommandTemplate(): string {
  return [
    "---",
    "description: Reset an existing OpenCode context-dropper loop",
    "---",
    "",
    "Use the current OpenCode chat as the controller for reset.",
    "The reset loop is strictly sequential.",
    "- Follow these steps exactly until the reset reaches the start-of-dropper condition.",
    "- Wait for each `previous` command to finish before deciding whether to run the next one.",
    "",
    "Steps:",
    "1. Validate that `$1` is present. If not, stop and tell the user to run `/context-dropper-reset <dropperName>`.",
    "2. Run `context-dropper dropper show-task-prompt $1` to verify the dropper exists.",
    "3. Run `context-dropper dropper previous $1` until it fails with the start-of-dropper condition.",
    "4. Ignore that final start-of-dropper failure because it means the reset completed.",
    "5. Run `context-dropper dropper is-done $1` and confirm the dropper is no longer done unless its fileset is empty.",
    "",
  ].join("\n");
}

function buildWorkerPrompt(): string {
  return [
    "You are the `context-dropper` worker subagent.",
    "",
    "Rules:",
    "- Handle exactly one file per task.",
    "- You are single-use. Finish one file and stop; do not expect to be reused for later files.",
    "- The controller will pass you a generated prompt that already contains the current file path and the user request.",
    "- You must read the file yourself before doing the task.",
    "- You are the only agent that should inspect file contents or perform the file-level work.",
    "- You may read, edit, write, and run commands or scripts as needed to complete the file-level task.",
    "- Do not create, inspect, advance, reset, or otherwise manage dropper state.",
    "- Do not start additional subtasks.",
    "- The generated prompt is intentionally thin. Treat this worker prompt as the stable behavior contract.",
    "- Do the requested work for the current file only.",
    "- Keep any intermediate reasoning out of your final answer.",
    "- Your final response must be exactly one line: `STATUS: SUCCESS` or `STATUS: FAILURE`.",
    "",
  ].join("\n");
}

function buildGeneratedFileContents(): Record<string, string> {
  return {
    [path.join(".opencode", "commands", "context-dropper-loop.md")]:
      buildContextDropperCommandTemplate(),
    [path.join(".opencode", "commands", "context-dropper-create.md")]:
      buildCreateCommandTemplate(),
    [path.join(".opencode", "commands", "context-dropper-status.md")]:
      buildStatusCommandTemplate(),
    [path.join(".opencode", "commands", "context-dropper-reset.md")]:
      buildResetCommandTemplate(),
    [path.join(".opencode", "prompts", "context-dropper-worker.md")]:
      buildWorkerPrompt(),
  };
}

export class DefaultOpenCodeInitTarget implements OpenCodeInitTarget {
  constructor(
    private readonly deps: OpenCodeInitTargetDeps = defaultOpenCodeInitTargetDeps,
  ) {}

  private async resolveConfigPath(cwd: string): Promise<string> {
    const jsonPath = path.join(cwd, "opencode.json");
    const jsoncPath = path.join(cwd, "opencode.jsonc");
    const [hasJson, hasJsonc] = await Promise.all([
      this.deps.fileExistsFn(jsonPath),
      this.deps.fileExistsFn(jsoncPath),
    ]);

    if (hasJson && hasJsonc) {
      throw new AppError(
        "Cannot initialize OpenCode scaffold: both opencode.json and opencode.jsonc exist",
      );
    }

    if (hasJsonc) {
      return jsoncPath;
    }

    if (hasJson) {
      return jsonPath;
    }

    return jsoncPath;
  }

  private buildConfigContent(
    originalContent: string,
    configPath: string,
    input: OpenCodeInitTargetInput,
  ): string {
    const parsed = parseConfigDocument(originalContent, configPath);
    const agent =
      parsed.agent === undefined
        ? {}
        : asObject(parsed.agent, `${configPath}#agent`);
    const nextConfig: JsonObject = {
      ...parsed,
      $schema: parsed.$schema ?? OPEN_CODE_SCHEMA_URL,
      agent: {
        ...agent,
        [WORKER_AGENT_NAME]: buildWorkerAgent(
          input.workerModel ?? "",
          input.workerReasoningEffort ?? "",
        ),
      },
    };

    return ensureTrailingNewline(stringifyJSONC(nextConfig, { indent: 2 }));
  }

  async init(input: OpenCodeInitTargetInput): Promise<OpenCodeInitTargetResult> {
    const configPath = await this.resolveConfigPath(input.cwd);
    const hadConfig = await this.deps.fileExistsFn(configPath);
    const originalConfig = hadConfig
      ? await this.deps.readTextFileFn(configPath)
      : "";
    const nextConfig = this.buildConfigContent(originalConfig, configPath, input);

    const generatedFiles = buildGeneratedFileContents();
    const writtenFiles = [configPath];

    await this.deps.writeTextFileFn(configPath, nextConfig);
    for (const [relativePath, content] of Object.entries(generatedFiles)) {
      const absolutePath = path.join(input.cwd, relativePath);
      await this.deps.ensureDirFn(path.dirname(absolutePath));
      await this.deps.writeTextFileFn(absolutePath, ensureTrailingNewline(content));
      writtenFiles.push(absolutePath);
    }

    writtenFiles.sort((a, b) => a.localeCompare(b));
    return {
      configPath,
      writtenFiles,
    };
  }
}
