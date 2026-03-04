import { describe, expect, test } from "bun:test";
import { DropperAtStartError, DropperExhaustedError } from "../dropper/errors";
import { mapErrorToExitCode } from "./error-mapper";
import { UsageError } from "./errors";

describe("cli/error-mapper", () => {
  test("maps usage errors to exit code 2", () => {
    expect(mapErrorToExitCode(new UsageError("bad usage"))).toBe(2);
  });

  test("maps exhausted dropper to exit code 3", () => {
    expect(mapErrorToExitCode(new DropperExhaustedError())).toBe(3);
  });

  test("maps at-start dropper to exit code 4", () => {
    expect(mapErrorToExitCode(new DropperAtStartError())).toBe(4);
  });

  test("maps unknown errors to exit code 1", () => {
    expect(mapErrorToExitCode(new Error("boom"))).toBe(1);
  });
});
