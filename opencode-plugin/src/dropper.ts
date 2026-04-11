import path from "node:path";
import type { DropperService } from "../../src/dropper/service";
import type { Logger } from "./logger";

export class Dropper {
  private readonly dataDir: string;

  constructor(
    cwd: string,
    private readonly filesetName: string,
    public readonly dropperName: string,
    private readonly log: Logger,
    private readonly dropperService: DropperService,
  ) {
    this.dataDir = path.resolve(cwd, ".context-dropper");
  }

  async create(): Promise<void> {
    this.log(`Creating dropper`, {
      dropperName: this.dropperName,
      filesetName: this.filesetName,
    });

    try {
      await this.dropperService.remove({
        dataDir: this.dataDir,
        dropperName: this.dropperName,
      });
    } catch (e: any) {
      if (e.message?.includes("not found")) {
        // dropper doesn't exist yet — that's fine, proceed to create
      } else {
        throw e;
      }
    }

    await this.dropperService.create({
      dataDir: this.dataDir,
      filesetName: this.filesetName,
      dropperName: this.dropperName,
    });
  }

  async tagProcessed(): Promise<void> {
    this.log(`Tagging current file as 'processed'`, {
      dropperName: this.dropperName,
    });

    await this.dropperService.tag({
      dataDir: this.dataDir,
      dropperName: this.dropperName,
      tags: ["processed"],
    });
  }

  async isDone(): Promise<boolean> {
    this.log(`Checking if done`, { dropperName: this.dropperName });

    try {
      await this.dropperService.isDone({
        dataDir: this.dataDir,
        dropperName: this.dropperName,
      });
      return true;
    } catch (_e) {
      return false; // Error implies there are untagged files remaining
    }
  }

  async nextFile(): Promise<void> {
    this.log(`Advancing to next file`, { dropperName: this.dropperName });

    await this.dropperService.next({
      dataDir: this.dataDir,
      dropperName: this.dropperName,
    });
  }

  async getCurrentFile(): Promise<{ path: string; content: string }> {
    const dump = await this.dropperService.dump({
      dataDir: this.dataDir,
      dropperName: this.dropperName,
    });

    const index = dump.pointer.currentIndex;
    if (index === null) {
      throw new Error("No current file found");
    }
    const filePath = dump.entries[index]?.path;
    if (!filePath) {
      throw new Error("No current file found");
    }

    let fileContent = "";
    try {
      fileContent = await this.dropperService.show({
        dataDir: this.dataDir,
        dropperName: this.dropperName,
      });
    } catch (e: any) {
      fileContent = `Error reading file: ${e.message}`;
    }

    return { path: filePath, content: fileContent };
  }
}
