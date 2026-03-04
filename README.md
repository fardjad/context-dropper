# context-eyedropper

`context-eyedropper` is a CLI for iterating through a fixed list of files, tracking
position, and tagging progress.

## Install and Run

```bash
bun install
```

Run directly:

```bash
bun run src/index.ts --help
```

Or after building your own wrapper/binary, use:

```bash
context-eyedropper --help
```

## Command Shape

```bash
context-eyedropper [--data-dir <path>] <command>
```

Global option:

- `--data-dir <path>`: directory where filesets and droppers are stored.
- Default: `./.context-eyedropper` resolved from current working directory.

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
context-eyedropper fileset import --name <name> <listFilePath>
```

- `listFilePath` must be plain text with one path per line.
- Blank lines are ignored.
- Relative lines are resolved from the list file directory.
- Each referenced file must exist and be readable.
- Stored entries become normalized absolute paths.

List filesets:

```bash
context-eyedropper fileset list
```

- Output: one fileset name per line.

Show fileset contents:

```bash
context-eyedropper fileset show <name>
```

- Output: one file path per line.

Remove fileset:

```bash
context-eyedropper fileset rm <name>
```

- Fails if any dropper still references it.

### `dropper`

Create:

```bash
context-eyedropper dropper create --fileset <filesetName> <dropperName>
```

Show current file contents:

```bash
context-eyedropper dropper show <dropperName>
```

Move pointer forward:

```bash
context-eyedropper dropper next <dropperName>
```

- Silent on success.

Move pointer backward:

```bash
context-eyedropper dropper previous <dropperName>
```

- Silent on success.

Tag current item:

```bash
context-eyedropper dropper tag <dropperName> --tag <text> [--tag <text>]...
```

List tags of current item:

```bash
context-eyedropper dropper list-tags <dropperName>
```

- Output: one tag per line.

Remove tags from current item:

```bash
context-eyedropper dropper rm-tag <dropperName> --tag <text> [--tag <text>]...
```

List dropper entries with optional filters:

```bash
context-eyedropper dropper list <dropperName> [--tag <tag>]... [--filename <absolutePath>]
```

- Output: paths only, one per line.
- Repeated `--tag` uses OR semantics.
- `--filename` is exact path match.
- When both are provided: AND semantics (`filename` match and tag OR match).

Dump dropper materialized state:

```bash
context-eyedropper dropper dump <dropperName>
```

- Output: pretty JSON.

Remove dropper:

```bash
context-eyedropper dropper rm <dropperName>
```

Check completion:

```bash
context-eyedropper dropper is-done <dropperName>
```

- Done condition: every file has at least one tag.
- If done: prints `true` and exits `0`.
- If not done: exits non-zero with an error listing untagged files.

## Exit Codes

- `0`: success
- `1`: application error
- `2`: usage/argument error
- `3`: dropper exhausted (`show` with no current item, or `next` at end)
- `4`: dropper at start (`previous` at start)

## Suggested AI-Agent Workflow

1. Import a fileset:
   `context-eyedropper fileset import --name <filesetName> <listFilePath>`
2. Create a dropper:
   `context-eyedropper dropper create --fileset <filesetName> <dropperName>`
3. Ask the agent to perform the task (for example: review/document each file)
   and follow the processing loop below.

## Agent Loop Rule

When acting as an agent over a dropper, use this exact loop:

1. Run `context-eyedropper dropper show <dropperName>`.
2. Perform the requested task on that file content.
3. Run `context-eyedropper dropper tag <dropperName> --tag processed`.
4. Run `context-eyedropper dropper is-done <dropperName>`.
5. If `is-done` succeeded and printed `true`, stop.
6. If `is-done` failed because untagged items remain, run
   `context-eyedropper dropper next <dropperName>` and repeat from step 1.

Notes for agents:

- `next` and `previous` are movement only; they do not print file contents.
- Use `show` to read the current file.
- Do not stop on `is-done` non-zero unless the message is not
  `Untagged items remain: ...`.
