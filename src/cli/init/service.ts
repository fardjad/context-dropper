import { AppError } from "../../file-utils/errors";
import {
  DefaultCodexInitTarget,
  type CodexInitTarget,
  type CodexInitTargetInput,
  type CodexInitTargetResult,
} from "./targets/codex";
import {
  DefaultOpenCodeInitTarget,
  type OpenCodeInitTarget,
  type OpenCodeInitTargetInput,
  type OpenCodeInitTargetResult,
} from "./targets/opencode";

export type InitTargetName = "codex" | "opencode";

export type InitTargetInput = {
  cwd: string;
  target: InitTargetName;
  workerModel?: string;
  workerReasoningEffort?: string;
};

export type InitTargetResult = {
  target: InitTargetName;
  configPath: string;
  writtenFiles: string[];
};

export interface InitService {
  listTargets(): InitTargetName[];
  init(input: InitTargetInput): Promise<InitTargetResult>;
}

interface InitTargetHandler {
  init(
    input: InitTargetInput | OpenCodeInitTargetInput | CodexInitTargetInput,
  ): Promise<InitTargetResult | OpenCodeInitTargetResult | CodexInitTargetResult>;
}

export class DefaultInitService implements InitService {
  private readonly targets: Record<InitTargetName, InitTargetHandler>;

  constructor(
    codexTarget: CodexInitTarget = new DefaultCodexInitTarget(),
    opencodeTarget: OpenCodeInitTarget = new DefaultOpenCodeInitTarget(),
  ) {
    this.targets = {
      codex: codexTarget,
      opencode: opencodeTarget,
    };
  }

  listTargets(): InitTargetName[] {
    return ["codex", "opencode"];
  }

  async init(input: InitTargetInput): Promise<InitTargetResult> {
    const target = this.targets[input.target];
    if (target === undefined) {
      throw new AppError(`Unsupported init target: ${input.target}`);
    }

    const result = await target.init(input);

    return {
      target: input.target,
      configPath: result.configPath,
      writtenFiles: result.writtenFiles,
    };
  }
}
