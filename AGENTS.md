# Agent Instructions

Always follow these repository rules.

## Architecture

- Read [docs/architecture.md](docs/architecture.md)
  before making structural changes.
- Keep CLI-only concerns in `src/cli`.
- Do not import `src/cli` from non-CLI modules.
- Keep module behavior, types, errors, and tests in the module that owns them.
- Keep exit codes and error-to-exit mapping in `src/cli` only.

## Toolchain

- Use Bun for package management, scripts, and tests.
- Prefer `bun install`, `bun add`, `bun remove`, `bun run`, and `bun test`.
- Keep distribution code compatible with standard Node.js.
- Do not use Bun-only runtime APIs in shipped source files.
- Use standard Node.js built-ins for filesystem, path, and network behavior in
  distribution code.

## External Docs

- Use Context7 automatically for external library and tool documentation,
  setup, and API reference checks.

## Versioning

- This repository publishes `context-dropper`.
- Follow semantic versioning.
- When bumping the package version, use
  `bun pm version <increment> --no-git-tag-version`.
- Release tags must use the `v<version>` format.
