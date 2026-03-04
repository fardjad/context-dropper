#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { extract } from "./cli/extract";

await yargs(hideBin(process.argv))
  .scriptName("context-eyedropper")
  .usage("$0 <cmd> [args]")
  .command(extract as any)
  .completion("completion", "Generate shell completion script")
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .alias("h", "help")
  .parseAsync();
