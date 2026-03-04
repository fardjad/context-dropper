import { throwNotImplemented } from "../file-utils/errors";
import type {
  FilesetRecord,
  ImportFilesetInput,
  ListFilesetsInput,
  RemoveFilesetInput,
  ShowFilesetInput,
} from "./types";

export interface FilesetService {
  importFromList(input: ImportFilesetInput): Promise<void>;
  list(input: ListFilesetsInput): Promise<FilesetRecord[]>;
  show(input: ShowFilesetInput): Promise<FilesetRecord>;
  remove(input: RemoveFilesetInput): Promise<void>;
}

export class StubFilesetService implements FilesetService {
  async importFromList(_input: ImportFilesetInput): Promise<void> {
    throwNotImplemented("fileset import");
  }

  async list(_input: ListFilesetsInput): Promise<FilesetRecord[]> {
    throwNotImplemented("fileset list");
  }

  async show(_input: ShowFilesetInput): Promise<FilesetRecord> {
    throwNotImplemented("fileset show");
  }

  async remove(_input: RemoveFilesetInput): Promise<void> {
    throwNotImplemented("fileset rm");
  }
}
