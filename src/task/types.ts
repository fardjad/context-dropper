export type TaskRecord = {
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  dataDir: string;
  name: string;
  content: string;
};

export type UpdateTaskInput = {
  dataDir: string;
  name: string;
  content: string;
};

export type ShowTaskInput = {
  dataDir: string;
  name: string;
};

export type ListTasksInput = {
  dataDir: string;
};

export type RemoveTaskInput = {
  dataDir: string;
  name: string;
};
