export type DropperPointerState = {
  currentIndex: number | null;
  total: number;
};

export type DropperListFilesStatus = "all" | "done" | "pending";

export type DropperRecord = {
  name: string;
  filesetName: string;
  taskName: string;
  pointer: DropperPointerState;
};

export type PersistedDropper = {
  fileset: string;
  task: string;
  pointer_position: number;
};

export type CreateDropperInput = {
  dataDir: string;
  filesetName: string;
  taskName: string;
  dropperName: string;
};

export type ShowTaskPromptInput = {
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

export type ListFilesDropperInput = {
  dataDir: string;
  dropperName: string;
  status: DropperListFilesStatus;
};

export type ListDropperInput = {
  dataDir: string;
  filesetName?: string;
};

export type RemoveDropperInput = {
  dataDir: string;
  dropperName: string;
};

export type IsDoneDropperInput = {
  dataDir: string;
  dropperName: string;
};
