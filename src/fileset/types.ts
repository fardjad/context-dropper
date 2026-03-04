export type FilesetRecord = {
  name: string;
  files: string[];
  createdAt: string;
  updatedAt: string;
};

export type ImportFilesetInput = {
  dataDir: string;
  name: string;
  listFilePath: string;
  normalizedFilePaths: string[];
};

export type ListFilesetsInput = {
  dataDir: string;
};

export type ShowFilesetInput = {
  dataDir: string;
  name: string;
};

export type RemoveFilesetInput = {
  dataDir: string;
  name: string;
};
