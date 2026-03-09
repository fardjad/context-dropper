import type { PluginInput } from "@opencode-ai/plugin";

type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = (
  msg: string,
  extra?: Record<string, unknown>,
  level?: LogLevel,
) => void;

const toastVariant: Record<LogLevel, string> = {
  debug: "info",
  info: "success",
  warn: "warning",
  error: "error",
};

export function createLogger(
  service: string,
  client: PluginInput["client"],
): Logger {
  return (msg, extra, level = "info") => {
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

    if (process.env.CONTEXT_DROPPER_TOAST_LOGS) {
      client.tui
        .showToast({
          body: {
            title: `[${service}] ${level.toUpperCase()}`,
            message: msg,
            variant: toastVariant[level] as any,
            duration: 4000,
          },
        })
        .catch((e: unknown) => {
          console.error(`[${service}] Failed to show toast: ${e}`);
        });
    }
  };
}
