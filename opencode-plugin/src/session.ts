import type { DropperService } from "../../src/dropper/service";
import { Dropper } from "./dropper";
import type { Logger } from "./logger";

export interface SessionOptions {
  instructions: string;
  cwd: string;
  filesetName: string;
  sessionId: string;
}

export class Session {
  private readonly dropper: Dropper;
  #pruneMessageId?: string;

  constructor(
    public readonly options: SessionOptions,
    private readonly log: Logger,
    dropperService: DropperService,
  ) {
    this.dropper = new Dropper(
      options.cwd,
      options.filesetName,
      `opencode-${options.filesetName}-${options.sessionId}`,
      log,
      dropperService,
    );
  }

  set pruneMessageId(messageId: string) {
    this.log(`Prune anchor set`, {
      sessionId: this.options.sessionId,
      messageId,
    });
    this.#pruneMessageId = messageId;
  }

  get pruneMessageId(): string | undefined {
    return this.#pruneMessageId;
  }

  pruneMessages(messages: any[]): number {
    if (!messages || messages.length === 0) return 0;

    if (!this.pruneMessageId) return 0;

    const totalBefore = messages.length;
    const index = messages.findIndex(
      (m) => m.info && m.info.id === this.pruneMessageId,
    );

    if (index !== -1) {
      // Keep exactly ONE part of the historical conversation before the current tool response:
      // 1. The assistant message that just called the context-dropper.next tool
      // Everything else (INCLUDING the initial user command) is wiped.
      const assistantMessage = messages[index];

      // We strip the text/content (including <think> blocks) from the current assistant message
      // so even the immediate preceding reasoning doesn't leak into the new file's context.
      // Opencode uses Vercel AI SDK message formats:
      // role can be top-level or in info, and content can be a string or a parts array.
      if (assistantMessage) {
        if (
          assistantMessage.role === "assistant" ||
          assistantMessage.info?.role === "assistant"
        ) {
          // Clear string content (where <think> usually lives)
          if (typeof assistantMessage.content === "string") {
            assistantMessage.content = "";
          }
          // Clear array parts (if using a multipart content format)
          if (Array.isArray(assistantMessage.parts)) {
            assistantMessage.parts = assistantMessage.parts.filter(
              (p: any) => p.type !== "text" && p.type !== "reasoning",
            );
          }
          if (Array.isArray(assistantMessage.content)) {
            assistantMessage.content = assistantMessage.content.filter(
              (p: any) => p.type !== "text" && p.type !== "reasoning",
            );
          }
        }
      }

      // Replace the entire array contents up to the active assistant message.
      messages.splice(0, index);

      this.log(`Deep context prune completed`, {
        sessionId: this.options.sessionId,
        removed: index,
        totalBefore,
        remaining: messages.length,
      });
      return index;
    }

    return 0;
  }

  async initDropper(): Promise<void> {
    await this.dropper.create();
  }

  async getCurrentFile(): Promise<{ path: string; content: string }> {
    return this.dropper.getCurrentFile();
  }

  async getPrompt(): Promise<string> {
    const file = await this.getCurrentFile();

    return (
      `<context_dropper_session id="${this.dropperName}">\n` +
      `You are currently processing a file injected by Context-Dropper. ` +
      `**DO NOT use any tools to read this file again.** The complete file content is already provided below.\n\n` +
      `<instructions>\n` +
      `${this.options.instructions}\n` +
      `</instructions>\n\n` +
      `<file path="${file.path}">\n` +
      `${file.content}\n` +
      `</file>\n\n` +
      `**IMPORTANT:** When you are completely finished fulfilling the instructions for this specific file, ` +
      `you MUST call the \`context-dropper_next\` tool to get the next file. Do not stop until all files are processed.\n` +
      `</context_dropper_session>`
    );
  }

  async tagProcessed(): Promise<void> {
    return this.dropper.tagProcessed();
  }

  async isDone(): Promise<boolean> {
    return this.dropper.isDone();
  }

  async nextFile(): Promise<void> {
    return this.dropper.nextFile();
  }

  get dropperName(): string {
    return this.dropper.dropperName;
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private log: Logger;
  private cwd: string;

  constructor(
    cwd: string,
    log: Logger,
    private readonly dropperService: DropperService,
  ) {
    this.cwd = cwd;
    this.log = log;
  }

  async createSession(
    sessionId: string,
    filesetName: string,
    instructions: string,
  ): Promise<Session> {
    const session = new Session(
      { sessionId, filesetName, instructions, cwd: this.cwd },
      this.log,
      this.dropperService,
    );
    this.sessions.set(sessionId, session);

    await session.initDropper();

    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.log(`Deleting session ${sessionId}`);
    this.sessions.delete(sessionId);
  }
}
