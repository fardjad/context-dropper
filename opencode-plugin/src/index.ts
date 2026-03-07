import { type Plugin, tool } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionManager } from "./session";
import { Toolkit } from "./toolkit";

// Set up a dedicated log file for the plugin
const opencodeDir = path.join(os.homedir(), ".opencode");
if (!fs.existsSync(opencodeDir)) {
  fs.mkdirSync(opencodeDir, { recursive: true });
}
const logFile = path.join(opencodeDir, "context-dropper.log");
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Helper to write logs to our dedicated file
const log = (msg: string, ...args: any[]) => {
  const timestamp = new Date().toISOString();
  const formattedArgs =
    args.length > 0
      ? " " +
        args
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
          .join(" ")
      : "";
  const logMessage = `[${timestamp}] [ContextDropper] ${msg}${formattedArgs}\n`;

  // Write to standard error for CLI, and append to our dedicated log file for Desktop
  console.error(`[ContextDropper] ${msg}`, ...args);
  try {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size >= MAX_LOG_SIZE_BYTES) {
        // Rotate: keep the last 50% of the log file to avoid losing immediate recent context,
        // while freeing up 5MB of space.
        const content = fs.readFileSync(logFile, "utf-8");
        const keepLength = Math.floor(content.length / 2);
        const rotatedContent = content.slice(-keepLength);

        // Find the first newline in the rotated content to avoid mid-line cuts
        const firstNewlineIndex = rotatedContent.indexOf("\n");
        const cleanContent =
          firstNewlineIndex !== -1
            ? rotatedContent.slice(firstNewlineIndex + 1)
            : rotatedContent;

        fs.writeFileSync(logFile, cleanContent);
      }
    }
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {
    console.error("Failed to write/rotate plugin log file", e);
  }
};

const sessionManager = new SessionManager();
// Assume the context-dropper should execute in the opencode working directory or current dir
// OpenCode gives us `process.cwd()` normally for the workspace.
const toolkit = new Toolkit(process.cwd());

const ContextDropperPlugin: Plugin = async (ctx) => {
  log("Plugin initializing...");
  // Show a greeting toast when the plugin loads!
  setTimeout(() => {
    ctx.client.tui
      .showToast({
        body: {
          title: "Context Dropper",
          message:
            "Plugin is active! Type '/drop <filesetName> <instructions>' to start.",
          variant: "success",
          duration: 5000,
        },
      })
      .catch((e: any) => log("Failed to show toast", e));
    log("Initialization toast sent");
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
            log(`Removing existing dropper ${dropperName}`);
            await toolkit.removeDropper(dropperName);

            log(
              `Creating dropper ${dropperName} from fileset ${args.filesetName}`,
            );
            await toolkit.createDropper(args.filesetName, dropperName);

            return await toolkit.getFilePrompt(
              dropperName,
              args.instructions,
              false,
            );
          } catch (error: any) {
            log(`Error in tool execution: ${error.message}`);
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
            log(`Tagging ${state.dropperName} current file as 'processed'`);
            await toolkit.tagProcessed(state.dropperName);

            log(`Checking if ${state.dropperName} is done`);
            const isDone = await toolkit.isDone(state.dropperName);

            if (isDone) {
              log(`Session ${state.dropperName} completed.`);
              sessionManager.deleteSession(sessionId);
              return `[Context-Dropper: All files have been processed. Task complete.]`;
            }

            log(`Advancing to next file in ${state.dropperName}`);
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
            log(`Error during 'next' processing: ${error.message}`);
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
          log(
            `Processing message chunk in session ${sessionId}. Starts with /drop? ${text.startsWith("/drop")}`,
          );

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
                log(`Removing existing dropper ${dropperName}`);
                await toolkit.removeDropper(dropperName);

                log(
                  `Creating dropper ${dropperName} from fileset ${filesetName}`,
                );
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
                  `Error starting context-dropper via /drop: ${error.message}`,
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
        const index = output.messages.findIndex(
          (m) => m.info && m.info.id === pruneStartId,
        );
        if (index !== -1) {
          output.messages.splice(0, index);
        }
      }
    },
  };
};

export default ContextDropperPlugin;
