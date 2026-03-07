# OpenCode Context Dropper Plugin

A Context Dropper plugin for OpenCode, built with Bun and TypeScript. It leverages the internal `context-dropper` APIs to efficiently process a large set of files one-by-one entirely within your OpenCode sessions. It automatically tracks context and handles token pruning to allow continuous agent iteration.

## Prerequisites

- [Bun](https://bun.sh/) (for building the plugin)
- [OpenCode](https://github.com/opencode-ai/opencode)

## Installation

This plugin bundles `context-dropper` directly and acts as a self-contained module.

1. Build the plugin in this directory:

```bash
bun install
bun run build
```

2. Find or create your OpenCode global configuration file at `~/.opencode/config.json`.
3. Add the absolute path to this directory (`opencode-plugin`) to the `plugins` array. For example:

```json
{
  "plugins": ["/Users/far/Projects/context-dropper/opencode-plugin"]
}
```

## Usage

Once installed, start OpenCode:

```bash
opencode
```

You can invoke the context dropper loop inside chat simply by using the `/drop` slash command:

```text
/drop <filesetName> <instructions>
```

- `<filesetName>` is the name of a pre-existing fileset in your project.
- `<instructions>` is the prompt you want the AI to perform on each file sequentially.

**Example:**

```text
/drop backend-routes Please add try/catch blocks and proper logging to all async functions in this file.
```

### The Automation Loop

Once invoked, the plugin completely takes over the context management:

1. It automatically fetches the first file in the fileset and provides it to the agent along with your instructions.
2. The agent performs the instructions and automatically calls the `context-dropper.next` tool.
3. **Context Pruning**: When the tool is called, the file is tagged as processed. The plugin drops the previous file's context from the chat history (saving tokens), and feeds the next file to the agent.
4. This loop continues until all files are processed.

To forcefully stop the loop before it finishes, type **"stop context-dropper"**.

## Development & Debugging

To develop the plugin further, modify files under `src/`.

```bash
bun install
# rebuild the bundle after changes
bun run build
```

### Debugging Logs

The plugin writes activity and execution state to a dedicated log file located at:

```bash
~/.opencode/context-dropper.log
```

You can monitor these logs in real-time by running the following command in your terminal:

```bash
tail -f ~/.opencode/context-dropper.log
```
