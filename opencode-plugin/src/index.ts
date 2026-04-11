import { type Hooks, type Plugin, tool } from "@opencode-ai/plugin";
import { DefaultDropperService } from "../../src/dropper/service";
import { createLogger, type Logger } from "./logger";
import { MessageHandler } from "./message-handler";
import { SessionManager } from "./session";
import { getPackageVersion } from "./version";

class Program {
  private readonly messageHandler: MessageHandler;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly log: Logger,
  ) {
    this.messageHandler = new MessageHandler();

    this.messageHandler.use(
      ":context-dropper <string:filesetName> <string:instructions>",
      async (
        { filesetName, instructions },
        { sessionId, messageId, input: _input },
      ) => {
        this.log(`Processing :context-dropper command`, { sessionId });
        const session = await this.sessionManager.createSession(
          sessionId,
          String(filesetName),
          String(instructions),
        );
        try {
          const prompt = await session.getPrompt();
          if (messageId) session.pruneMessageId = messageId;

          return prompt;
        } catch (error: any) {
          this.log(
            `Error handling :context-dropper command`,
            { error: error.message },
            "error",
          );
          return `Error handling :context-dropper: ${error.message}`;
        }
      },
    );
  }

  private getActiveSession(messages: any[]) {
    if (!messages || messages.length === 0) return;
    const firstMessage = messages[0];
    if (!firstMessage?.info) return;

    const sessionId = firstMessage.info.sessionID;
    if (!sessionId) return;

    return this.sessionManager.getSession(sessionId);
  }

  private get tools() {
    return {
      "context-dropper_init": tool({
        description: "Initializes the context-dropper task.",
        args: {
          filesetName: tool.schema
            .string()
            .describe("The name of the fileset to process"),
          instructions: tool.schema
            .string()
            .describe("Instructions on what to do with the files"),
        },
        execute: async (args, context) => {
          const { filesetName, instructions } = args;
          const sessionId = context.sessionID;

          const session = await this.sessionManager.createSession(
            sessionId,
            filesetName,
            instructions,
          );

          try {
            return await session.getPrompt();
          } catch (error: any) {
            this.log(
              `Error in context-dropper_init`,
              { error: error.message },
              "error",
            );
            return `Error in context-dropper_init: ${error.message}`;
          }
        },
      }),
      "context-dropper_next": tool({
        description:
          "Call this tool when you have finished processing the current file to save state, prune context, and fetch the next file.",
        args: {},
        execute: async (_args, context) => {
          const sessionId = context.sessionID;
          const session = this.sessionManager.getSession(sessionId);

          if (!session) {
            return "No active context-dropper session found. Please initialize one first.";
          }

          try {
            await session.tagProcessed();

            const isDone = await session.isDone();

            if (isDone) {
              this.log(`Session completed`, {
                dropperName: session.dropperName,
              });
              this.sessionManager.deleteSession(sessionId);
              return `[Context-Dropper: All files have been processed. Task complete.]`;
            }

            await session.nextFile();

            const prompt = await session.getPrompt();

            // Mark this tool message as the start of the new context for pruning
            session.pruneMessageId = context.messageID;

            return prompt;
          } catch (error: any) {
            this.log(
              `Error in context-dropper_next`,
              { error: error.message },
              "error",
            );
            return `[context-dropper_next error: ${error.message}]`;
          }
        },
      }),
    };
  }

  get plugin() {
    return {
      tool: this.tools,
      "chat.message": this.messageHandler.handle,
      "experimental.chat.messages.transform": async (_input, output) => {
        const activeSession = this.getActiveSession(output.messages);
        activeSession?.pruneMessages(output.messages);
      },
    } satisfies Hooks;
  }
}

export default (async (ctx) => {
  const log = createLogger("context-dropper", ctx.client);
  log(`Plugin initializing! Version: ${getPackageVersion()}`);

  const dropperService = new DefaultDropperService();
  const sessionManager = new SessionManager(ctx.worktree, log, dropperService);
  return new Program(sessionManager, log).plugin;
}) satisfies Plugin;
