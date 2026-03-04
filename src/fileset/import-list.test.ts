import { describe, expect, test } from "bun:test";
import { readAndValidateFilesetEntries } from "./import-list";

describe("fileset/import-list", () => {
  test("resolves entries via injected seams without filesystem", async () => {
    const readableChecks: Array<{ filePath: string; label: string }> = [];

    const entries = await readAndValidateFilesetEntries(
      "/repo/lists/files.txt",
      {
        assertReadableFileFn: async (filePath: string, label: string) => {
          readableChecks.push({ filePath, label });
        },
        readTextFileFn: async () => {
          return "../source/a.txt\n\n./b.txt\n";
        },
        dirnameFn: (filePath: string) => {
          expect(filePath).toBe("/repo/lists/files.txt");
          return "/repo/lists";
        },
        normalizeAbsolutePathFn: (pathLike: string, baseDir: string) => {
          return `${baseDir}|${pathLike}`;
        },
      },
    );

    expect(entries).toEqual([
      "/repo/lists|../source/a.txt",
      "/repo/lists|./b.txt",
    ]);
    expect(readableChecks).toEqual([
      { filePath: "/repo/lists/files.txt", label: "Fileset list file" },
      { filePath: "/repo/lists|../source/a.txt", label: "Fileset entry" },
      { filePath: "/repo/lists|./b.txt", label: "Fileset entry" },
    ]);
  });
});
