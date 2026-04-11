# Contributing to Context Dropper

Thank you for your interest in contributing! This document outlines how to
build and develop the `context-dropper` CLI.

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

This also installs the repository Git hooks via Husky.

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

### Developing the OpenCode Scaffold

To generate the local OpenCode scaffold into the current repository:

```bash
bun run src/index.ts opencode init
```

Then start OpenCode in that project and run:

```text
/context-dropper <fileset> "<task>"
```
