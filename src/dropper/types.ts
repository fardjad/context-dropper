export type DropperEntry = {
  path: string;
  tags: string[];
};

export type DropperPointerState = {
  currentIndex: number | null;
  total: number;
};

export type DropperRecord = {
  name: string;
  filesetName: string;
  entries: DropperEntry[];
  pointer: DropperPointerState;
  createdAt: string;
  updatedAt: string;
};

export type PersistedDropper = {
  fileset: string;
  pointer_position: number;
  tags: Record<string, string[]>;
};

export type CreateDropperInput = {
  dataDir: string;
  filesetName: string;
  dropperName: string;
};

export type ShowDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type NextDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type PreviousDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type TagDropperInput = {
  dataDir: string;
  dropperName: string;
  tags: string[];
};

export type ListDropperTagsInput = {
  dataDir: string;
  dropperName: string;
};

export type RemoveDropperTagsInput = {
  dataDir: string;
  dropperName: string;
  tags: string[];
};

export type ListDropperInput = {
  dataDir: string;
  dropperName: string;
  tags?: string[];
  filename?: string;
};

export type RemoveDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type DumpDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type IsDoneDropperInput = {
  dataDir: string;
  dropperName: string;
};
