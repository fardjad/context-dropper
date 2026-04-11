# context-dropper

`context-dropper` is a CLI for iterating through a fixed list of files, tracking
position, and tagging progress.

## Why Context Dropper?

AI coding agents struggle with large codebases in two main ways:

1. **Search doesn't guarantee coverage:** Agents often rely on semantic or
   keyword search to find relevant files, and it works well in many cases. But
   for tasks that require iterating over every file in a set, there is no
   guarantee that search alone will find them all.
2. **Context windows are a hard constraint:** Feeding an entire codebase into an
   LLM at once is often simply impossible. Codebases frequently exceed the
   model's token limit. Even when it fits, reasoning quality degrades as the
   context grows.

`context-dropper` solves this by enforcing strict, programmable processing
loops.

Instead of relying on search, a precise list of target files (a "fileset") is
curated upfront - either manually or by using other tools - and the agent is
instructed to process that exact list sequentially. As the agent moves from one
file to the next, it can drop the previous file's tokens from memory. Each file
is then evaluated in a **clean context**.

This approach guarantees 100% file coverage, minimizes token usage, and keeps
the model's reasoning sharp.

### A Conceptual Example

Consider an agent tasked with exploring a large codebase to document every piece
of authentication logic it finds into a single file
(`authentication-discovery.md`). Without `context-dropper`, the agent would use
search to find files containing keywords like "auth", "login", or "session", and
might miss files that contain authentication logic but don't match those
keywords. With `context-dropper`, the agent instead iterates over a fixed,
curated list of files, such as all files in a subdirectory or a filtered list
from a test coverage report.

Here is how that looks in practice:

1. **The Fileset**: A discrete list of target files is provided to the tool:
   - `src/auth/login.ts`
   - `src/routes/api.ts`
   - `src/middleware/session.ts`
2. **The Dropper**: A "dropper" is created and attached to that fileset. The
   dropper acts as a stateful bookmark that tracks exactly where the agent is in
   the list (it can go forward or backward).
3. **The Loop**: The AI agent is given a strict set of instructions: _"Read the
   current file from the dropper. If authentication logic is found, append the
   findings to `authentication-discovery.md`. Then mark the file as 'processed',
   and move the dropper to the next file until the list is exhausted."_

By explicitly unloading the previous file from its context window before moving
the dropper, the context size remains small. This prevents the LLM from blowing
past its token limits or suffering from degraded reasoning. In theory, an
unlimited number of files can be processed this way.

## Installation

You can install `context-dropper` using one of the following methods.

### 1. Download Pre-compiled Binary (Recommended)

Download the latest standalone executable for your operating system from the
[Releases](https://github.com/fardjad/context-dropper/releases) page. Ensure it
is executable and in your `PATH`.

```bash
chmod +x context-dropper
mv context-dropper /usr/local/bin/
```

### 2. Install via Package Manager

You can install the package globally from NPM.

**Bun:**

```bash
bun install -g context-dropper
```

**NPM:**

```bash
npm install -g context-dropper
```

Then run it anywhere:

```bash
context-dropper --help
```

### 3. Build from Source (Development)

To develop, compile binaries from source, or contribute to the project, please
refer to the [Contributing Guide](CONTRIBUTING.md).

## Command Shape

```bash
context-dropper [--data-dir <path>] <command>
```

Global option:

- `--data-dir <path>`: directory where filesets and droppers are stored.
- Default: `./.context-dropper` resolved from current working directory.

If run with no command, usage/help is shown. If `fileset` or `dropper` are run
without a subcommand, that group help is shown.

## Data Layout

The CLI stores state under `data-dir`:

```text
data-dir/
  filesets/
    <name>.txt
  droppers/
    <name>.json
```

Fileset file (`filesets/<name>.txt`):

- One normalized absolute file path per line.
- Import is immutable: importing the same fileset name again fails.

Dropper file (`droppers/<name>.json`):

```json
{
  "fileset": "my-fileset",
  "pointer_position": 0,
  "tags": {
    "processed": ["/abs/path/a.ts", "/abs/path/b.ts"]
  }
}
```

- `tags` is `tag -> filename[]`.
- Filename arrays are deduplicated and sorted.

## Name Rules

Fileset/dropper names must:

- Match `^[A-Za-z0-9._-]+$`
- Not be `.` or `..`
- Not contain path separators

## Commands

### `fileset`

Import from a list file:

```bash
context-dropper fileset import --name <name> <listFilePath>
```

- `listFilePath` must be plain text with one path per line.
- Blank lines are ignored.
- Relative lines are resolved from the list file directory.
- Each referenced file must exist and be readable.
- Stored entries become normalized absolute paths.

List filesets:

```bash
context-dropper fileset list
```

- Output: one fileset name per line.

Show fileset contents:

```bash
context-dropper fileset show <name>
```

- Output: one file path per line.

Remove fileset:

```bash
context-dropper fileset remove <name>
```

- Fails if any dropper still references it.

### `dropper`

Create:

```bash
context-dropper dropper create --fileset <filesetName> <dropperName>
```

Show current file contents:

```bash
context-dropper dropper show <dropperName>
```

Show compact current state:

```bash
context-dropper dropper current <dropperName>
```

- Output: compact JSON with current file path and pointer state.

Move pointer forward:

```bash
context-dropper dropper next <dropperName>
```

- Silent on success.

Move pointer backward:

```bash
context-dropper dropper previous <dropperName>
```

- Silent on success.

Tag current item:

```bash
context-dropper dropper tag <dropperName> --tag <text> [--tag <text>]...
```

List tags of current item:

```bash
context-dropper dropper list-tags <dropperName>
```

- Output: one tag per line.

Remove tags from current item:

```bash
context-dropper dropper remove-tag <dropperName> --tag <text> [--tag <text>]...
```

List dropper entries with optional filters:

```bash
context-dropper dropper list-files <dropperName> [--tag <tag>]... [--filename <absolutePath>]
```

- Output: paths only, one per line.
- Repeated `--tag` uses OR semantics.
- `--filename` is exact path match.
- When both are provided: AND semantics (`filename` match and tag OR match).
- Aliases: `context-dropper dropper ls-files <dropperName>`

List all droppers, optionally filtered by fileset name:

```bash
context-dropper dropper list [--fileset <filesetName>]
```

- Output: one dropper name per line.
- When `--fileset` is provided, filters for droppers referencing that fileset.
- Aliases: `context-dropper dropper ls [--fileset <filesetName>]`

Dump dropper materialized state:

```bash
context-dropper dropper dump <dropperName>
```

- Output: pretty JSON.

Remove dropper:

```bash
context-dropper dropper remove <dropperName>
```

Check completion:

```bash
context-dropper dropper is-done <dropperName>
```

- Done condition: every file has at least one tag.
- If done: prints `true` and exits `0`.
- If not done: exits non-zero with an error listing untagged files.

## OpenCode Scaffolding

`context-dropper` can scaffold a project-local OpenCode setup that uses
markdown slash commands plus controller/worker agents:

```bash
context-dropper opencode init
```

Optional model overrides:

```bash
context-dropper opencode init \
  --controller-model openai/gpt-5 \
  --worker-model openai/gpt-5-mini
```

This writes:

- `opencode.jsonc` (or merges into an existing `opencode.json` /
  `opencode.jsonc`)
- `.opencode/commands/context-dropper.md`
- `.opencode/commands/context-dropper-status.md`
- `.opencode/commands/context-dropper-reset.md`
- `.opencode/prompts/context-dropper-controller.md`
- `.opencode/prompts/context-dropper-worker.md`

After scaffolding, use OpenCode with:

```text
/context-dropper <fileset> "<task>"
```

The generated setup uses a controller agent that only drives the
`context-dropper` CLI and delegates one-file-at-a-time work to a worker
subagent.

## Exit Codes

- `0`: success
- `1`: application error
- `2`: usage/argument error
- `3`: dropper exhausted (`show` with no current item, or `next` at end)
- `4`: dropper at start (`previous` at start)

## Suggested AI-Agent Workflow

1. Import a fileset:
   `context-dropper fileset import --name <filesetName> <listFilePath>`
2. Create a dropper:
   `context-dropper dropper create --fileset <filesetName> <dropperName>`
3. Ask the agent to perform the task (for example: review/document each file)
   and follow the processing loop below.

## Agent Loop Rule

When acting as an agent over a dropper, use this exact loop:

1. Run `context-dropper dropper show <dropperName>`.
2. Perform the requested task on that file content.
3. Run `context-dropper dropper tag <dropperName> --tag processed`.
4. Run `context-dropper dropper is-done <dropperName>`.
5. If `is-done` succeeded and printed `true`, stop.
6. If `is-done` failed because untagged items remain, run
   `context-dropper dropper next <dropperName>` and repeat from step 1.

Notes for agents:

- `next` and `previous` are movement only; they do not print file contents.
- Use `show` to read the current file.
- Do not stop on `is-done` non-zero unless the message is not
  `Untagged items remain: ...`.
