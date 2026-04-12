import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKER_AGENT_NAME = "context_dropper_worker";

export type CodexInitTargetInput = {
  cwd: string;
  workerModel?: string;
  workerReasoningEffort?: string;
};

export type CodexInitTargetResult = {
  configPath: string;
  writtenFiles: string[];
};

export interface CodexInitTarget {
  init(input: CodexInitTargetInput): Promise<CodexInitTargetResult>;
}

export type CodexInitTargetDeps = {
  ensureDirFn: (directoryPath: string) => Promise<void>;
  fileExistsFn: (filePath: string) => Promise<boolean>;
  readTextFileFn: (filePath: string) => Promise<string>;
  writeTextFileFn: (filePath: string, content: string) => Promise<void>;
};

export const defaultCodexInitTargetDeps: CodexInitTargetDeps = {
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

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildTomlString(value: string): string {
  return JSON.stringify(value);
}

function buildWorkerAgentToml(model: string, reasoningEffort: string): string {
  const lines = [
    `name = ${buildTomlString(WORKER_AGENT_NAME)}`,
    `description = ${buildTomlString(
      "Handles exactly one file for a context-dropper iteration.",
    )}`,
  ];

  if (model.length > 0) {
    lines.push(`model = ${buildTomlString(model)}`);
  }
  if (reasoningEffort.length > 0) {
    lines.push(
      `model_reasoning_effort = ${buildTomlString(reasoningEffort)}`,
    );
  }

  lines.push(
    'developer_instructions = """',
    "You are the context-dropper worker for Codex.",
    "",
    "Rules:",
    "- Handle exactly one file for one dropper iteration.",
    "- You are single-use. Finish one file and stop; do not expect to be reused for later files.",
    "- The controller provides the generated prompt from `context-dropper dropper show-task-prompt <dropperName>`.",
    "- Read the file yourself before doing the task.",
    "- Do the requested work for the current file only.",
    "- Do not create, inspect, advance, reset, or otherwise manage dropper state.",
    "- Do not spawn additional subagents.",
    "- End with a brief result that makes success or failure explicit.",
    '"""',
  );

  return lines.join("\n");
}

function buildSkillFrontmatter(name: string, description: string): string {
  return ["---", `name: ${name}`, `description: ${description}`, "---", ""].join(
    "\n",
  );
}

function buildLoopSkill(): string {
  return [
    buildSkillFrontmatter(
      "context-dropper-loop",
      "Use when the user wants to run an existing context-dropper loop in Codex for a named dropper.",
    ),
    "Use this skill to run an existing dropper loop.",
    "",
    "The loop is strictly sequential.",
    "- Follow these steps exactly until the dropper is done.",
    "- Wait for each worker to finish before running any more dropper commands.",
    "- Explicitly close each worker agent after it finishes before advancing to the next file.",
    "- Never run `next`, `is-done`, or `show-task-prompt` in parallel with each other.",
    "- After a worker succeeds, advance first, then fetch the next prompt from the updated pointer state.",
    `- Spawn a brand-new \`${WORKER_AGENT_NAME}\` agent for every file. Do not reuse a worker across iterations.`,
    "- Do not optimize the loop by batching files, overlapping work, or keeping a worker alive across files.",
    "",
    "Workflow:",
    "1. Validate that the user provided a dropper name, or ask for it.",
    "2. Use the current Codex chat as the controller.",
    "3. Run `context-dropper dropper is-done <dropperName>`.",
    "4. If it returns `true`, stop and report completion.",
    "5. Run `context-dropper dropper show-task-prompt <dropperName>`.",
    `6. Spawn the \`${WORKER_AGENT_NAME}\` custom agent with that exact generated prompt.`,
    "7. Wait for that worker to finish, then explicitly close it.",
    "8. If the worker fails, stop and report failure.",
    "9. Run `context-dropper dropper next <dropperName>`.",
    "10. Repeat until done.",
    "",
    "Do not create a separate controller subagent.",
  ].join("\n");
}

function buildCreateSkill(): string {
  return [
    buildSkillFrontmatter(
      "context-dropper-create",
      "Use when the user wants Codex to create a context-dropper from an existing fileset and stored task.",
    ),
    "Use this skill to create a dropper from an existing fileset and stored task.",
    "",
    "The loop is strictly sequential once the user starts running it.",
    "",
    "Workflow:",
    "1. Validate that the user provided both a fileset name and a stored task name.",
    "2. Use the current Codex chat as the controller.",
    "3. Verify the fileset with `context-dropper fileset show <filesetName>`.",
    "4. Verify the task with `context-dropper task show <taskName>`.",
    "5. Derive the dropper name as `codex-<filesetName>`.",
    "6. Run `context-dropper dropper create --fileset <filesetName> --task <taskName> <dropperName>`.",
    "7. Report the created dropper name.",
    "",
    "The generated dropper name must be `codex-<filesetName>`.",
  ].join("\n");
}

function buildStatusSkill(): string {
  return [
    buildSkillFrontmatter(
      "context-dropper-status",
      "Use when the user wants Codex to inspect the current status of a named context-dropper.",
    ),
    "Use this skill to inspect dropper progress.",
    "",
    "Run the status commands sequentially so the reported state comes from one consistent point in time.",
    "",
    "Workflow:",
    "1. Validate that the user provided a dropper name, or ask for it.",
    "2. Use the current Codex chat as the controller.",
    "3. Run `context-dropper dropper is-done <dropperName>`.",
    "4. Run `context-dropper dropper list-files <dropperName> --done`.",
    "5. Run `context-dropper dropper list-files <dropperName> --pending`.",
    "6. Summarize completion state and remaining files for the user.",
  ].join("\n");
}

function buildResetSkill(): string {
  return [
    buildSkillFrontmatter(
      "context-dropper-reset",
      "Use when the user wants Codex to reset a named context-dropper back to the start.",
    ),
    "Use this skill to rewind a dropper to the start.",
    "",
    "The reset loop is strictly sequential.",
    "- Follow these steps exactly until the reset reaches the start-of-dropper condition.",
    "- Wait for each `previous` command to finish before deciding whether to run the next one.",
    "",
    "Workflow:",
    "1. Validate that the user provided a dropper name, or ask for it.",
    "2. Use the current Codex chat as the controller.",
    "3. Run `context-dropper dropper show-task-prompt <dropperName>` to verify the dropper exists.",
    "4. Run `context-dropper dropper previous <dropperName>` until it reaches the start-of-dropper condition.",
    "5. Treat the final start-of-dropper condition as a successful reset.",
  ].join("\n");
}

function buildGeneratedFileContents(input: CodexInitTargetInput): Record<string, string> {
  return {
    [path.join(".codex", "agents", "context-dropper-worker.toml")]:
      buildWorkerAgentToml(
        input.workerModel ?? "",
        input.workerReasoningEffort ?? "",
      ),
    [path.join(".agents", "skills", "context-dropper-create", "SKILL.md")]:
      buildCreateSkill(),
    [path.join(".agents", "skills", "context-dropper-loop", "SKILL.md")]:
      buildLoopSkill(),
    [path.join(".agents", "skills", "context-dropper-reset", "SKILL.md")]:
      buildResetSkill(),
    [path.join(".agents", "skills", "context-dropper-status", "SKILL.md")]:
      buildStatusSkill(),
  };
}

export class DefaultCodexInitTarget implements CodexInitTarget {
  constructor(
    private readonly deps: CodexInitTargetDeps = defaultCodexInitTargetDeps,
  ) {}

  async init(input: CodexInitTargetInput): Promise<CodexInitTargetResult> {
    const generatedFiles = buildGeneratedFileContents(input);
    const workerPath = path.join(
      input.cwd,
      ".codex",
      "agents",
      "context-dropper-worker.toml",
    );
    const writtenFiles = [workerPath];

    for (const [relativePath, content] of Object.entries(generatedFiles)) {
      const absolutePath = path.join(input.cwd, relativePath);
      await this.deps.ensureDirFn(path.dirname(absolutePath));
      await this.deps.writeTextFileFn(absolutePath, ensureTrailingNewline(content));
      if (absolutePath !== workerPath) {
        writtenFiles.push(absolutePath);
      }
    }

    writtenFiles.sort((a, b) => a.localeCompare(b));
    return {
      configPath: workerPath,
      writtenFiles,
    };
  }
}
