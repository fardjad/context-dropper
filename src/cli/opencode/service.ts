import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyEdits,
  modify,
  parse,
  type FormattingOptions,
  type ParseError,
} from "jsonc-parser";
import { AppError } from "../../file-utils/errors";

const OPEN_CODE_SCHEMA_URL = "https://opencode.ai/config.json";
const CONTROLLER_AGENT_NAME = "context-dropper-controller";
const WORKER_AGENT_NAME = "context-dropper-worker";

const JSON_FORMATTING: FormattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
};

type JsonObject = Record<string, unknown>;

export type InitOpenCodeScaffoldInput = {
  cwd: string;
  controllerModel?: string;
  workerModel?: string;
};

export type InitOpenCodeScaffoldResult = {
  configPath: string;
  writtenFiles: string[];
};

export interface OpenCodeScaffoldService {
  init(
    input: InitOpenCodeScaffoldInput,
  ): Promise<InitOpenCodeScaffoldResult>;
}

export type OpenCodeScaffoldServiceDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  readTextFileFn: (filePath: string) => Promise<string>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
};

export const defaultOpenCodeScaffoldServiceDeps: OpenCodeScaffoldServiceDeps = {
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

function applyJsonEdit(
  source: string,
  jsonPath: (string | number)[],
  value: unknown,
): string {
  return applyEdits(
    source,
    modify(source, jsonPath, value, {
      formattingOptions: JSON_FORMATTING,
    }),
  );
}

function parseConfigDocument(content: string, filePath: string): JsonObject {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  if (errors.length > 0) {
    throw new AppError(`Invalid OpenCode config: ${filePath}`);
  }

  if (parsed === undefined) {
    return {};
  }

  return asObject(parsed, filePath);
}

function buildControllerAgent(model: string): JsonObject {
  const agent: JsonObject = {
    description: "Controls the context-dropper loop and delegates file work",
    mode: "primary",
    prompt: "{file:.opencode/prompts/context-dropper-controller.md}",
    permission: {
      bash: {
        "*": "allow",
      },
      read: {
        "*": "deny",
      },
      edit: {
        "*": "deny",
      },
      webfetch: {
        "*": "deny",
      },
      task: {
        "*": "deny",
        [WORKER_AGENT_NAME]: "allow",
      },
    },
  };

  if (model.length > 0) {
    agent.model = model;
  }

  return agent;
}

function buildWorkerAgent(model: string): JsonObject {
  const agent: JsonObject = {
    description: "Handles one file at a time for a context-dropper loop",
    mode: "subagent",
    hidden: true,
    prompt: "{file:.opencode/prompts/context-dropper-worker.md}",
    permission: {
      bash: {
        "*": "allow",
      },
      read: {
        "*": "allow",
      },
      edit: {
        "*": "allow",
      },
      webfetch: {
        "*": "allow",
      },
      task: {
        "*": "deny",
      },
    },
  };

  if (model.length > 0) {
    agent.model = model;
  }

  return agent;
}

function buildContextDropperCommandTemplate(): string {
  return [
    "---",
    "description: Process a fileset with context-dropper using a worker subagent",
    `agent: ${CONTROLLER_AGENT_NAME}`,
    "subtask: true",
    "---",
    "",
    "<context_dropper_request>",
    "  <action>run</action>",
    "  <fileset>$1</fileset>",
    "  <task>$2</task>",
    "</context_dropper_request>",
    "",
    "If the fileset or task is missing, stop and tell the user to run:",
    '`/context-dropper <fileset> "<task>"`',
    "",
  ].join("\n");
}

function buildStatusCommandTemplate(): string {
  return [
    "---",
    "description: Inspect the current OpenCode context-dropper loop state",
    `agent: ${CONTROLLER_AGENT_NAME}`,
    "subtask: true",
    "---",
    "",
    "<context_dropper_request>",
    "  <action>status</action>",
    "  <fileset>$1</fileset>",
    "</context_dropper_request>",
    "",
    "If the fileset is missing, stop and tell the user to run:",
    "`/context-dropper-status <fileset>`",
    "",
  ].join("\n");
}

function buildResetCommandTemplate(): string {
  return [
    "---",
    "description: Reset the derived OpenCode context-dropper loop state",
    `agent: ${CONTROLLER_AGENT_NAME}`,
    "subtask: true",
    "---",
    "",
    "<context_dropper_request>",
    "  <action>reset</action>",
    "  <fileset>$1</fileset>",
    "</context_dropper_request>",
    "",
    "If the fileset is missing, stop and tell the user to run:",
    "`/context-dropper-reset <fileset>`",
    "",
  ].join("\n");
}

function buildControllerPrompt(): string {
  return [
    "You are the `context-dropper` OpenCode controller.",
    "",
    "Capabilities and limits:",
    "- You may use `bash` and the Task tool only.",
    `- You may invoke only the \`${WORKER_AGENT_NAME}\` subagent.`,
    "- Do not read, edit, or write files directly yourself.",
    "- Do not use web fetching tools.",
    "",
    "Common rules:",
    "- The user message contains `<context_dropper_request>` with an `<action>` and `<fileset>`.",
    "- Derive the dropper name as `opencode-<fileset>`.",
    "- Use the `context-dropper` CLI from the project root.",
    "- If any CLI command fails for a reason other than an expected not-found check, stop and report the error output.",
    "- Never tag or advance a file unless the worker completed successfully.",
    "",
    "For `<action>run</action>`:",
    "1. Validate that both `<fileset>` and `<task>` are present. If not, stop and show the required command syntax.",
    "2. Check whether the derived dropper exists by running `context-dropper dropper current <dropperName>`.",
    "3. If it does not exist, run `context-dropper dropper create --fileset <fileset> <dropperName>`.",
    "4. Start a loop:",
    "   - Run `context-dropper dropper current <dropperName>` and read `currentFile`, `pointer.currentIndex`, and `pointer.total` from the compact JSON output.",
    "   - Run `context-dropper dropper show <dropperName>` to capture the current file content.",
    `   - Invoke the \`${WORKER_AGENT_NAME}\` subagent for exactly one file. Pass the current file path, the user's per-file task, and the current file content. Tell the worker it may use normal tools as needed but must not touch dropper state.`,
    "   - If the worker reports failure or blockage, stop immediately without tagging or advancing.",
    "   - Run `context-dropper dropper tag <dropperName> --tag processed`.",
    "   - Run `context-dropper dropper is-done <dropperName>`.",
    "   - If it succeeds, stop and summarize completion briefly.",
    "   - If it fails with `Untagged items remain`, run `context-dropper dropper next <dropperName>` and continue the loop.",
    "",
    "For `<action>status</action>`:",
    "- Validate `<fileset>` is present.",
    "- Run `context-dropper dropper current <dropperName>` and summarize the current pointer, total files, and current file path if available.",
    "",
    "For `<action>reset</action>`:",
    "- Validate `<fileset>` is present.",
    "- If the derived dropper exists, run `context-dropper dropper remove <dropperName>`.",
    "- Run `context-dropper dropper create --fileset <fileset> <dropperName>`.",
    "- Run `context-dropper dropper current <dropperName>` and confirm the reset state.",
    "",
  ].join("\n");
}

function buildWorkerPrompt(): string {
  return [
    "You are the `context-dropper` worker subagent.",
    "",
    "Rules:",
    "- Handle exactly one file per task.",
    "- The controller will pass you the file path, the user task, and the current file content.",
    "- You may read, edit, write, and run bash as needed to complete the file-level task.",
    "- Do not create, tag, advance, reset, or inspect dropper state.",
    "- Do not start additional subtasks.",
    "- Return a concise result that clearly states whether the file-level work succeeded or what blocked it.",
    "",
  ].join("\n");
}

function buildGeneratedFileContents(): Record<string, string> {
  return {
    [path.join(".opencode", "commands", "context-dropper.md")]:
      buildContextDropperCommandTemplate(),
    [path.join(".opencode", "commands", "context-dropper-status.md")]:
      buildStatusCommandTemplate(),
    [path.join(".opencode", "commands", "context-dropper-reset.md")]:
      buildResetCommandTemplate(),
    [path.join(".opencode", "prompts", "context-dropper-controller.md")]:
      buildControllerPrompt(),
    [path.join(".opencode", "prompts", "context-dropper-worker.md")]:
      buildWorkerPrompt(),
  };
}

export class DefaultOpenCodeScaffoldService implements OpenCodeScaffoldService {
  constructor(
    private readonly deps: OpenCodeScaffoldServiceDeps = defaultOpenCodeScaffoldServiceDeps,
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
    input: InitOpenCodeScaffoldInput,
  ): string {
    const parsed = parseConfigDocument(originalContent, configPath);
    let nextContent =
      originalContent.trim().length === 0 ? "{\n}\n" : ensureTrailingNewline(originalContent);

    if (parsed.$schema === undefined) {
      nextContent = applyJsonEdit(nextContent, ["$schema"], OPEN_CODE_SCHEMA_URL);
    }

    nextContent = applyJsonEdit(nextContent, ["agent", CONTROLLER_AGENT_NAME], {
      ...buildControllerAgent(input.controllerModel ?? ""),
    });
    nextContent = applyJsonEdit(nextContent, ["agent", WORKER_AGENT_NAME], {
      ...buildWorkerAgent(input.workerModel ?? ""),
    });

    return ensureTrailingNewline(nextContent);
  }

  async init(
    input: InitOpenCodeScaffoldInput,
  ): Promise<InitOpenCodeScaffoldResult> {
    const configPath = await this.resolveConfigPath(input.cwd);
    const configExists = await this.deps.fileExistsFn(configPath);
    const originalContent = configExists
      ? await this.deps.readTextFileFn(configPath)
      : "";
    const nextConfigContent = this.buildConfigContent(
      originalContent,
      configPath,
      input,
    );

    const generatedFiles = buildGeneratedFileContents();
    const commandsDir = path.join(input.cwd, ".opencode", "commands");
    const promptsDir = path.join(input.cwd, ".opencode", "prompts");

    await Promise.all([
      this.deps.ensureDirFn(commandsDir),
      this.deps.ensureDirFn(promptsDir),
    ]);

    await this.deps.writeTextFileFn(configPath, nextConfigContent);

    const writtenFiles = [configPath];
    for (const [relativePath, content] of Object.entries(generatedFiles).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const absolutePath = path.join(input.cwd, relativePath);
      await this.deps.writeTextFileFn(absolutePath, ensureTrailingNewline(content));
      writtenFiles.push(absolutePath);
    }

    return {
      configPath,
      writtenFiles,
    };
  }
}
