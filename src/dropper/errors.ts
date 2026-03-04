import { AppError } from "../file-utils/errors";

export class DropperExhaustedError extends AppError {
  constructor(message = "No file left in dropper") {
    super(message);
  }
}

export class DropperAtStartError extends AppError {
  constructor(message = "Dropper is already at the first item") {
    super(message);
  }
}
