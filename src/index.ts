#!/usr/bin/env bun
import { runCli } from "./cli/app";

const exitCode = await runCli(process.argv);
if (exitCode !== 0) {
  process.exit(exitCode);
}
