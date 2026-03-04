import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

const PORTABLE_NAME_REGEX = /^[A-Za-z0-9._-]+$/;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

export function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new AppError(`${label} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AppError(`${label} must not be empty`);
  }

  return normalized;
}

export function validatePortableName(
  name: string,
  kind: "fileset" | "dropper",
): void {
  if (name === "." || name === "..") {
    throw new AppError(`Invalid ${kind} name: ${name}`);
  }

  if (!PORTABLE_NAME_REGEX.test(name)) {
    throw new AppError(
      `Invalid ${kind} name: ${name}. Use only letters, numbers, dot, underscore, or dash.`,
    );
  }

  if (name.includes("/") || name.includes("\\")) {
    throw new AppError(`Invalid ${kind} name: ${name}`);
  }

  if (path.basename(name) !== name) {
    throw new AppError(`Invalid ${kind} name: ${name}`);
  }

  if (RESERVED_WINDOWS_NAMES.has(name.toUpperCase())) {
    throw new AppError(`Invalid ${kind} name: ${name}`);
  }
}

export function normalizeAbsolutePath(
  pathLike: string,
  baseDir: string,
): string {
  const normalizedPath = pathLike.trim();
  if (normalizedPath.length === 0) {
    throw new AppError("Path must not be empty");
  }

  return path.resolve(baseDir, normalizedPath);
}

export async function assertReadableFile(
  filePath: string,
  label: string,
): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new AppError(`${label} is not readable: ${filePath}`);
  }
}

export function normalizeTagList(values: unknown, label: string): string[] {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of source) {
    const tag = asNonEmptyString(value, label);
    if (seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}
