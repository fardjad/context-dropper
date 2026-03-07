import path from "node:path";
import { DefaultDropperService } from "../../src/dropper/service";
import { DefaultFilesetService } from "../../src/fileset/service";
import { type Logger } from "./logger";

export class Toolkit {
  private readonly dropperService: DefaultDropperService;
  private readonly filesetService: DefaultFilesetService;
  private readonly dataDir: string;
  private readonly log: Logger;

  constructor(
    cwd: string,
    log: Logger,
    dropperService?: DefaultDropperService,
    filesetService?: DefaultFilesetService,
  ) {
    this.log = log;
    this.dropperService = dropperService ?? new DefaultDropperService();
    this.filesetService = filesetService ?? new DefaultFilesetService();
    this.dataDir = path.resolve(cwd, ".context-dropper");
  }

  async createDropper(filesetName: string, dropperName: string): Promise<void> {
    this.log(`Creating dropper`, { dropperName, filesetName });
    await this.dropperService.create({
      dataDir: this.dataDir,
      filesetName,
      dropperName,
    });
  }

  async removeDropper(dropperName: string): Promise<void> {
    this.log(`Removing dropper`, { dropperName });
    try {
      await this.dropperService.remove({
        dataDir: this.dataDir,
        dropperName,
      });
    } catch (e: any) {
      if (e.message && e.message.includes("not found")) {
        // ignore if not found
        return;
      }
      throw e;
    }
  }

  async tagProcessed(dropperName: string): Promise<void> {
    this.log(`Tagging current file as 'processed'`, { dropperName });
    await this.dropperService.tag({
      dataDir: this.dataDir,
      dropperName,
      tags: ["processed"],
    });
  }

  async isDone(dropperName: string): Promise<boolean> {
    this.log(`Checking if done`, { dropperName });
    try {
      await this.dropperService.isDone({
        dataDir: this.dataDir,
        dropperName,
      });
      return true;
    } catch (e) {
      return false; // Error implies there are untagged files remaining
    }
  }

  async nextFile(dropperName: string): Promise<void> {
    this.log(`Advancing to next file`, { dropperName });
    await this.dropperService.next({
      dataDir: this.dataDir,
      dropperName,
    });
  }

  async getFilePrompt(
    dropperName: string,
    instructions: string,
    isNext: boolean = false,
  ): Promise<string> {
    const dump = await this.dropperService.dump({
      dataDir: this.dataDir,
      dropperName,
    });

    const index = dump.pointer.currentIndex;
    const filePath =
      index !== null && index >= 0 && index < dump.entries.length
        ? (dump.entries[index]?.path ?? "Unknown File")
        : "Unknown File";

    let fileContent = "";
    try {
      fileContent = await this.dropperService.show({
        dataDir: this.dataDir,
        dropperName,
      });
    } catch (e: any) {
      fileContent = `Error reading file: ${e.message}`;
    }

    const header = isNext
      ? `[Context-Dropper: Advanced to next file]`
      : `Context-dropper task initialized for session '${dropperName}'.`;

    return (
      `${header}\n\n` +
      `Instructions for this file:\n${instructions}\n\n` +
      `File: ${filePath}\n\n` +
      `File Content:\n${fileContent}\n\n` +
      `When you are done with this file, DO NOT just say "DONE". You MUST call the 'context-dropper.next' tool to automatically fetch the next file.`
    );
  }
}
