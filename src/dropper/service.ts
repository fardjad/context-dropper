import { throwNotImplemented } from "../file-utils/errors";
import type {
  CreateDropperInput,
  DropperEntry,
  DropperRecord,
  DumpDropperInput,
  ListDropperInput,
  ListDropperTagsInput,
  NextDropperInput,
  PreviousDropperInput,
  RemoveDropperInput,
  RemoveDropperTagsInput,
  ShowDropperInput,
  TagDropperInput,
} from "./types";

export interface DropperService {
  create(input: CreateDropperInput): Promise<void>;
  show(input: ShowDropperInput): Promise<string>;
  next(input: NextDropperInput): Promise<void>;
  previous(input: PreviousDropperInput): Promise<void>;
  tag(input: TagDropperInput): Promise<void>;
  listTags(input: ListDropperTagsInput): Promise<string[]>;
  removeTags(input: RemoveDropperTagsInput): Promise<void>;
  list(input: ListDropperInput): Promise<DropperEntry[]>;
  remove(input: RemoveDropperInput): Promise<void>;
  dump(input: DumpDropperInput): Promise<DropperRecord>;
}

export class StubDropperService implements DropperService {
  async create(_input: CreateDropperInput): Promise<void> {
    throwNotImplemented("dropper create");
  }

  async show(_input: ShowDropperInput): Promise<string> {
    throwNotImplemented("dropper show");
  }

  async next(_input: NextDropperInput): Promise<void> {
    throwNotImplemented("dropper next");
  }

  async previous(_input: PreviousDropperInput): Promise<void> {
    throwNotImplemented("dropper previous");
  }

  async tag(_input: TagDropperInput): Promise<void> {
    throwNotImplemented("dropper tag");
  }

  async listTags(_input: ListDropperTagsInput): Promise<string[]> {
    throwNotImplemented("dropper list-tags");
  }

  async removeTags(_input: RemoveDropperTagsInput): Promise<void> {
    throwNotImplemented("dropper rm-tag");
  }

  async list(_input: ListDropperInput): Promise<DropperEntry[]> {
    throwNotImplemented("dropper list");
  }

  async remove(_input: RemoveDropperInput): Promise<void> {
    throwNotImplemented("dropper rm");
  }

  async dump(_input: DumpDropperInput): Promise<DropperRecord> {
    throwNotImplemented("dropper dump");
  }
}
