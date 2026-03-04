import { DropperAtStartError, DropperExhaustedError } from "../dropper/errors";
import { UsageError } from "./errors";

export function mapErrorToExitCode(error: unknown): number {
  if (error instanceof UsageError) {
    return 2;
  }

  if (error instanceof DropperExhaustedError) {
    return 3;
  }

  if (error instanceof DropperAtStartError) {
    return 4;
  }

  return 1;
}

export function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
