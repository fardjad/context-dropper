export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export function throwNotImplemented(operation: string): never {
  throw new AppError(`Not implemented: ${operation}`);
}
