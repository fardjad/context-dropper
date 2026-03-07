import { type Plugin, tool } from "@opencode-ai/plugin";
import { getPackageVersion } from "../../src/version/version";
import { createLogger } from "./logger";
import { SessionManager } from "./session";
import { Toolkit } from "./toolkit";

const ContextDropperPlugin: Plugin = async (ctx) => {
  const version = getPackageVersion();
  const log = createLogger("context-dropper", ctx.client);
  const toolkit = new Toolkit(ctx.worktree, log);
  const sessionManager = new SessionManager(log);

  log(`Plugin initializing! Version: ${version}`);

  // Show a greeting toast when the plugin loads!
  setTimeout(() => {
    ctx.client.tui
      .showToast({
        body: {
          title: `Context Dropper v${version}`,
          message:
            "Plugin is active! Type '/drop <filesetName> <instructions>' to start.",
          variant: "success",
          duration: 5000,
        },
      })
      .catch((e: any) =>
        log("Failed to show toast", { error: String(e) }, "warn"),
      );
    log("Initialization complete", { worktree: ctx.worktree, version });
  }, 1000); // Slight delay to ensure TUI is fully mounted

  return {
    tool: {
      "context-dropper": tool({
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
          const dropperName = `session-${context.sessionID}`;

          sessionManager.setSession(context.sessionID, {
            dropperName,
            instructions: args.instructions,
          });

          try {
            await toolkit.removeDropper(dropperName);
            await toolkit.createDropper(args.filesetName, dropperName);

            return await toolkit.getFilePrompt(
              dropperName,
              args.instructions,
              false,
            );
          } catch (error: any) {
            log(`Error in tool execution`, { error: error.message }, "error");
            return `Error initializing context-dropper: ${error.message}`;
          }
        },
      }),
      "context-dropper.next": tool({
        description:
          "Call this tool when you have finished processing the current file to save state, prune context, and fetch the next file.",
        args: {},
        execute: async (args, context) => {
          const sessionId = context.sessionID;
          const state = sessionManager.getSession(sessionId);

          if (!state) {
            return "No active context-dropper session found. Please initialize one first.";
          }

          try {
            await toolkit.tagProcessed(state.dropperName);

            const isDone = await toolkit.isDone(state.dropperName);

            if (isDone) {
              log(`Session completed`, { dropperName: state.dropperName });
              sessionManager.deleteSession(sessionId);
              return `[Context-Dropper: All files have been processed. Task complete.]`;
            }

            await toolkit.nextFile(state.dropperName);

            const prompt = await toolkit.getFilePrompt(
              state.dropperName,
              state.instructions,
              true,
            );

            // Mark this tool message as the start of the new context for pruning
            sessionManager.setPruneMessageId(sessionId, context.messageID);

            return prompt;
          } catch (error: any) {
            log(
              `Error during 'next' processing`,
              { error: error.message },
              "error",
            );
            return `[Context-Dropper Error: ${error.message}]`;
          }
        },
      }),
    },
    "chat.message": async (input, output) => {
      const sessionId = input.sessionID;

      for (const part of output.parts) {
        if (part.type === "text") {
          const text = part.text.trim().toLowerCase();
          log(`Processing message chunk`, {
            sessionId,
            startsWithDrop: text.startsWith("/drop"),
          });

          if (text.startsWith("/drop ")) {
            const originalText = part.text.trim();
            const match = originalText.match(/^\/drop\s+([^\s]+)\s+(.+)$/is);

            if (match) {
              const filesetName = match[1] || "";
              const instructions = match[2] || "";
              const dropperName = `session-${sessionId}`;

              sessionManager.setSession(sessionId, {
                dropperName,
                instructions,
              });

              try {
                await toolkit.removeDropper(dropperName);
                await toolkit.createDropper(filesetName, dropperName);

                const prompt = await toolkit.getFilePrompt(
                  dropperName,
                  instructions,
                  false,
                );
                part.text = prompt;

                if (output.message?.id) {
                  sessionManager.setPruneMessageId(
                    sessionId,
                    output.message.id,
                  );
                }
              } catch (error: any) {
                log(
                  `Error starting context-dropper via /drop`,
                  {
                    error: error.message,
                  },
                  "error",
                );
                part.text = `Error starting context-dropper: ${error.message}`;
              }
            } else {
              part.text =
                "Invalid command format. Please use: `/drop <filesetName> <instructions>`";
            }
            continue;
          }

          if (
            text.includes("stop context-dropper") ||
            text.includes("stop dropping")
          ) {
            sessionManager.deleteSession(sessionId);
            part.text +=
              "\n\n[Context-Dropper: Process stopped manually by user. State cleared.]";
            continue;
          }
        }
      }
    },
    "experimental.chat.messages.transform": async (input, output) => {
      if (!output.messages || output.messages.length === 0) return;
      const firstMessage = output.messages[0];
      if (!firstMessage || !firstMessage.info) return;

      const sessionId = firstMessage.info.sessionID;
      if (!sessionId) return;

      const pruneStartId = sessionManager.getPruneMessageId(sessionId);
      if (pruneStartId) {
        const totalBefore = output.messages.length;
        const index = output.messages.findIndex(
          (m) => m.info && m.info.id === pruneStartId,
        );
        if (index !== -1) {
          output.messages.splice(0, index);
          log(`Context pruned`, {
            sessionId,
            removed: index,
            totalBefore,
            remaining: output.messages.length,
          });
        }
      }
    },
  };
};

export default ContextDropperPlugin;
