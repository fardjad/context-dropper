# Contributing to Context Dropper

Thank you for your interest in contributing! This document outlines how to build
and develop both the main `context-dropper` CLI and the `opencode-plugin`.

## Prerequisites

- [Bun](https://bun.sh/) (required for package management, running tests, and
  compiling binaries)

## Getting Started

First, clone the repository and install the dependencies:

```bash
git clone https://github.com/fardjad/context-dropper.git
cd context-dropper
bun install
```

This also installs the repository Git hooks via Husky. The pre-commit hook runs
Biome and TypeScript checks for both the CLI package and the plugin package.

### Developing the CLI

To run the CLI from source without compiling:

```bash
bun run src/index.ts --help
```

To build the standalone binaries for all supported platforms yourself, run:

```bash
bun run build
bun run build:standalone
```

The compiled executables will be available in the `./dist/` directory.

### Developing the OpenCode Plugin

The OpenCode plugin binds natively to the `context-dropper` core logic and acts
as a self-contained module.

If you are modifying the OpenCode plugin (`opencode-plugin/`), ensure you have
also installed dependencies within that specific directory and trigger the build
step:

```bash
cd opencode-plugin
bun install
bun run build
```

To test your local modifications within OpenCode, point OpenCode directly to
your checked-out local directory:

1. Create or edit your OpenCode project-level configuration file `opencode.json`
   or global `~/.config/opencode/opencode.json`.
2. Add the absolute path to your checked-out `opencode-plugin` directory to the
   `plugin` array:

```json
{
  "plugin": ["/absolute/path/to/context-dropper/opencode-plugin"]
}
```

Every time you modify the code in `opencode-plugin/src/`, run `bun run build`
again and restart OpenCode.

#### Debugging Plugin Logs

The plugin writes activity and execution state to a dedicated log file located
at:

```bash
~/.opencode/context-dropper.log
```

You can monitor these logs in real-time by running the following command in your
terminal:

```bash
tail -f ~/.opencode/context-dropper.log
```
