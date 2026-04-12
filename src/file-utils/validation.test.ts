import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AppError } from "./errors";
import {
  asNonEmptyString,
  normalizeAbsolutePath,
  validatePortableName,
} from "./validation";

describe("file-utils/validation", () => {
  test("validatePortableName accepts portable names", () => {
    expect(() => validatePortableName("abc-123._", "fileset")).not.toThrow();
  });

  test("validatePortableName rejects invalid names", () => {
    expect(() => validatePortableName("bad name", "dropper")).toThrow(AppError);
    expect(() => validatePortableName("..", "dropper")).toThrow(AppError);
    expect(() => validatePortableName("x/y", "dropper")).toThrow(AppError);
  });

  test("normalizeAbsolutePath resolves relative paths", () => {
    const baseDir = "/tmp/base";
    expect(normalizeAbsolutePath("./a.txt", baseDir)).toBe(
      path.resolve(baseDir, "a.txt"),
    );
  });

  test("asNonEmptyString rejects empty input", () => {
    expect(() => asNonEmptyString("   ", "value")).toThrow(AppError);
  });
});
