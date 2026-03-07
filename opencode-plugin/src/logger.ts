import type { PluginInput } from "@opencode-ai/plugin";

type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = (
  msg: string,
  extra?: Record<string, unknown>,
  level?: LogLevel,
) => void;

export function createLogger(
  service: string,
  client: PluginInput["client"],
): Logger {
  return (msg, extra, level = "info") => {
    // Fire-and-forget: log errors are not worth surfacing to the user
    client.app
      .log({
        body: {
          service,
          level,
          message: msg,
          ...(extra !== undefined ? { extra } : {}),
        },
      })
      .catch((e: unknown) => {
        console.error(`[${service}] Failed to send log: ${e}`);
      });
  };
}
