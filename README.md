# context-dropper

`context-dropper` is a CLI for running strict file-by-file agent loops over a
fixed list of files.

It separates the problem into three stored concepts:

- `fileset`: an immutable list of files
- `task`: a reusable Markdown instruction document
- `dropper`: a pointer bound to one fileset and one task

The dropper advances one file at a time. When the pointer reaches the end of
the fileset, the dropper is done.

## Why Context Dropper?

AI coding agents struggle with large codebases in two main ways:

1. Search does not guarantee coverage.
2. Large context windows reduce reliability and can exceed model limits.

`context-dropper` solves that by forcing an explicit loop over a curated file
list. A controller agent can keep only the current file in focus, hand that
file to a worker, then advance the pointer.

## Installation

### Download a standalone binary

Download the latest executable from
[Releases](https://github.com/fardjad/context-dropper/releases), then:

```bash
chmod +x context-dropper
mv context-dropper /usr/local/bin/
```

### Install from npm

```bash
bun install -g context-dropper
```

or:

```bash
npm install -g context-dropper
```

### Build from source

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Shell Completion

Generate shell completion with:

```bash
context-dropper completion
```

For `zsh`:

```bash
echo 'autoload -Uz compinit && compinit' >> ~/.zshrc
SHELL=/bin/zsh context-dropper completion >> ~/.zshrc
```

For `bash`:

```bash
SHELL=/bin/bash context-dropper completion >> ~/.bashrc
```

## Command Shape

```bash
context-dropper [--data-dir <path>] <command>
```

Global option:

- `--data-dir <path>`: directory where filesets, tasks, and droppers are stored
- default: `./.context-dropper` resolved from the current working directory

## Data Layout

```text
data-dir/
  .gitignore
  filesets/
    <name>.txt
  tasks/
    <name>.md
  droppers/
    <name>.json
```

Fileset file:

- one stored relative path per line
- paths are stored relative to the directory containing `--data-dir`
- with the default `--data-dir ./.context-dropper`, this means fileset entries
  are relative to the repository root
- import validates real files on disk first, then rewrites them into this
  relative form
- entries outside that base directory are rejected

Task file:

- plain Markdown
- editable by hand
- blank lines are preserved

Dropper file:

```json
{
  "fileset": "tracked",
  "task": "review-auth",
  "pointer_position": 0
}
```

Pointer semantics:

- `0` means the first file is active
- `0 <= pointer_position < total` means the dropper has an active file
- `pointer_position === total` means the dropper is done

Generated `.gitignore`:

- the tool creates `data-dir/.gitignore` automatically on first write
- it ignores `droppers/`
- it does not ignore `filesets/` or `tasks/`, so those can be checked in

## Name Rules

Fileset, task, and dropper names must:

- match `^[A-Za-z0-9._-]+$`
- not be `.` or `..`
- not contain path separators

## Commands

### `fileset`

Import from a list file:

```bash
context-dropper fileset import --name <name> <listFilePath>
```

Import behavior:

- relative lines in the input list are resolved from the list file location
- absolute lines are allowed as input
- after validation, all stored entries are rewritten relative to the directory
  containing `--data-dir`
- this keeps checked-in filesets portable across machines and clones

List filesets:

```bash
context-dropper fileset list
```

Show fileset contents:

```bash
context-dropper fileset show <name>
```

Remove fileset:

```bash
context-dropper fileset remove <name>
```

Removal fails if any dropper still references the fileset.

### `task`

Create a task from Markdown:

```bash
context-dropper task create <taskName> --from <markdownFilePath>
```

Show task contents:

```bash
context-dropper task show <taskName>
```

List tasks:

```bash
context-dropper task list
```

Update a task from Markdown:

```bash
context-dropper task update <taskName> --from <markdownFilePath>
```

Remove a task:

```bash
context-dropper task remove <taskName>
```

### `dropper`

Create a dropper:

```bash
context-dropper dropper create \
  --fileset <filesetName> \
  --task <taskName> \
  <dropperName>
```

Generate the worker prompt for the current file:

```bash
context-dropper dropper show-task-prompt <dropperName>
```

The generated prompt includes:

- the current file path
- the stored Markdown task
- a strict response contract:
  - `STATUS: SUCCESS`
  - `STATUS: FAILURE`
- no extra explanation payload

Advance the pointer:

```bash
context-dropper dropper next <dropperName>
```

Move the pointer backward:

```bash
context-dropper dropper previous <dropperName>
```

Check completion:

```bash
context-dropper dropper is-done <dropperName>
```

Output is always `true` or `false`.

List droppers:

```bash
context-dropper dropper list [--fileset <filesetName>]
```

List files in a dropper:

```bash
context-dropper dropper list-files <dropperName> [--done | --pending | --all]
```

Filters are pointer-based:

- `--done`: files with index `< pointer_position`
- `--pending`: files with index `>= pointer_position`
- `--all`: every file

Default is `--all`.

Remove a dropper:

```bash
context-dropper dropper remove <dropperName>
```

### `init`

Generate scaffolding for a supported output target:

```bash
context-dropper init <target>
```

Current target:

- `codex`
- `opencode`

Example:

```bash
context-dropper init codex
```

```bash
context-dropper init opencode
```

Optional model overrides:

```bash
context-dropper init opencode \
  --worker-model openai/gpt-5-mini
```

Optional reasoning-effort overrides work for the generated worker subagent:

```bash
context-dropper init opencode \
  --worker-model openai/gpt-5-mini \
  --worker-reasoning-effort medium
```

For Codex, the same worker overrides apply:

```bash
context-dropper init codex \
  --worker-model gpt-5.4-mini \
  --worker-reasoning-effort medium
```

The `init` command is target-oriented so future outputs such as `codex` can be
added without changing the top-level CLI shape.

## Codex Scaffolding

`context-dropper init codex` writes:

- `.codex/agents/context-dropper-worker.toml`
- `.agents/skills/context-dropper-create/SKILL.md`
- `.agents/skills/context-dropper-loop/SKILL.md`
- `.agents/skills/context-dropper-status/SKILL.md`
- `.agents/skills/context-dropper-reset/SKILL.md`

The generated Codex setup follows the Codex docs structure:

- project-scoped custom agents live under `.codex/agents/`
- repo-scoped skills live under `.agents/skills/`
- skills act as the reusable entrypoints for create, loop, status, and reset workflows
- the current Codex chat acts as the controller
- the worker agent owns one-file-at-a-time execution
- the controller loop is strictly sequential: wait for each worker to finish before advancing and fetching the next prompt
- each file must run in a brand-new worker agent to avoid context rot; never reuse a worker across iterations
- the controller should explicitly close each worker after it finishes
- `--worker-model` sets `model` in the generated worker agent TOML
- `--worker-reasoning-effort` sets `model_reasoning_effort` in the generated worker agent TOML

Suggested Codex workflow:

1. Import a fileset:
   `context-dropper fileset import --name <filesetName> <listFilePath>`
2. Write a Markdown task file.
3. Create a stored task:
   `context-dropper task create <taskName> --from <markdownFilePath>`
4. In Codex, invoke `$context-dropper-create`.
5. In Codex, invoke `$context-dropper-loop`.

The generated Codex workflow derives dropper names as `codex-<filesetName>`.

## OpenCode Scaffolding

`context-dropper init opencode` writes:

- `opencode.jsonc` or merges into an existing `opencode.json` / `opencode.jsonc`
- `.opencode/commands/context-dropper-loop.md`
- `.opencode/commands/context-dropper-create.md`
- `.opencode/commands/context-dropper-status.md`
- `.opencode/commands/context-dropper-reset.md`
- `.opencode/prompts/context-dropper-worker.md`

The generated OpenCode setup uses the current chat as the controller:

- the current OpenCode chat manages droppers and loop state
- the worker receives a thin generated per-file prompt plus its stable worker role prompt
- on `STATUS: SUCCESS`, the controller advances the dropper
- on `STATUS: FAILURE`, the controller stops
- the controller loop is strictly sequential: wait for each worker to finish before advancing and fetching the next prompt
- each file must run in a brand-new worker subagent to avoid context rot; never reuse a worker across iterations
- the controller should explicitly close each worker subagent after it finishes
- `--worker-model` sets `model` in the generated OpenCode worker agent config
- `--worker-reasoning-effort` sets `reasoningEffort` in the generated OpenCode worker agent config

## Suggested Agent Workflow

1. Import a fileset:
   `context-dropper fileset import --name <filesetName> <listFilePath>`
2. Write a Markdown task file.
3. Create a stored task:
   `context-dropper task create <taskName> --from <markdownFilePath>`
4. In OpenCode, create the dropper:
   `/context-dropper-create <filesetName> <taskName>`
5. Then run it:
   `/context-dropper-loop opencode-<filesetName>`

The generated OpenCode commands are intentionally narrow:

- `/context-dropper-create <fileset> <taskName>` creates `opencode-<fileset>`
- `/context-dropper-loop <dropperName>` runs an existing dropper until it is done
- `/context-dropper-status <dropperName>` inspects an existing dropper
- `/context-dropper-reset <dropperName>` rewinds an existing dropper to the start
- `<taskName>` is the name of an existing stored task, not raw task text

## Exit Codes

- `0`: success
- `1`: application error
- `2`: usage or argument error
- `3`: dropper exhausted
- `4`: dropper at start

## Fileset Recipes

Import all tracked files:

```bash
git ls-files > .context-dropper-fileset.txt
context-dropper fileset import --name tracked .context-dropper-fileset.txt
rm .context-dropper-fileset.txt
```

Import files from a specific Git ref:

```bash
tmpdir="$(mktemp -d)"
git worktree add --detach "$tmpdir" <ref>
git -C "$tmpdir" ls-files > "$tmpdir/.context-dropper-fileset.txt"
context-dropper fileset import \
  --name from-ref \
  "$tmpdir/.context-dropper-fileset.txt"
git worktree remove "$tmpdir"
```

Import almost everything:

```bash
find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -type f -print \
  | sed 's|^\./||' > .context-dropper-fileset.txt
context-dropper fileset import --name everything .context-dropper-fileset.txt
rm .context-dropper-fileset.txt
```
