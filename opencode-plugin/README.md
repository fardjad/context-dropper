# OpenCode Context Dropper Plugin

A Context Dropper plugin for OpenCode, built with Bun and TypeScript. It
leverages the internal `context-dropper` APIs to efficiently process a large set
of files one-by-one entirely within your OpenCode sessions. It automatically
tracks context and handles token pruning to allow continuous agent iteration.

## Prerequisites

- [Bun](https://bun.sh/) (for building the plugin)
- [OpenCode](https://github.com/opencode-ai/opencode)

## Installation

You can install the `context-dropper` plugin using one of the following methods.

### 1. Configure OpenCode (Recommended)

You do not need to manually install the package. OpenCode will automatically
resolve and install it from the NPM registry when you add it to your
configuration.

You can configure the plugin either globally for all projects, or locally for a
single project:

**Option A: Project-Level (Local)**

1. Create or edit the `opencode.json` file in the root of your project.
2. Add the package name to the `plugin` array:

```json
{
  "plugin": ["opencode-context-dropper-plugin"]
}
```

**Option B: Global-Level**

1. Create or edit your global OpenCode config file at
   `~/.config/opencode/opencode.json`.
2. Add the package name to the `plugin` array:

```json
{
  "plugin": ["opencode-context-dropper-plugin"]
}
```

(Optional) If you prefer to manage the installation yourself, you can install
the plugin globally using Bun (`bun install -g opencode-context-dropper-plugin`)
or NPM (`npm install -g opencode-context-dropper-plugin`).

## Usage

Once installed, start OpenCode:

```bash
opencode
```

You can invoke the context dropper loop inside chat simply by using the
`:context-dropper` slash command:

```text
:context-dropper <filesetName> <instructions>
```

- `<filesetName>` is the name of a pre-existing fileset in your project.
- `<instructions>` is the prompt you want the AI to perform on each file
  sequentially.

**Example:**

```text
:context-dropper backend-routes Please add try/catch blocks and proper logging to all async functions in this file.
```

### The Automation Loop

Once invoked, the plugin completely takes over the context management:

1. It automatically fetches the first file in the fileset and provides it to the
   agent along with your instructions.
2. The agent performs the instructions and automatically calls the
   `context-dropper_next` tool.
3. **Context Pruning**: When the tool is called, the file is tagged as
   processed. The plugin drops the previous file's context from the chat history
   (saving tokens), and feeds the next file to the agent.
4. This loop continues until all files are processed.

To forcefully stop the loop before it finishes, type **"stop context-dropper"**.

## Logging

Plugin activity is written to OpenCode's native log system via the
`context-dropper` service. To view logs, run OpenCode with debug-level output
enabled:

```bash
opencode --log-level debug
```

Unexpected errors are logged at `error` level and are visible at any log level.
Operational events (dropper lifecycle, context pruning) are logged at `info`
level.
