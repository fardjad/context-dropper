import type { CommandModule } from "yargs";

export const extract: CommandModule = {
  command: "extract",
  describe: "Extract context from files",
  builder: (yargs) => {
    return yargs.option("path", {
      alias: "p",
      describe: "Path to extract from",
      type: "string",
      demandOption: true,
    });
  },
  handler: async (argv) => {
    console.log(`Extracting context from: ${argv.path}`);
    // Future extraction logic here
  },
};
