# Architecture

This document defines the current source layout and dependency boundaries for
`context-dropper`.

## Modules

- `src/cli`: CLI entrypoint, command wiring, exit-code mapping, and init-target
  orchestration.
- `src/fileset`: fileset domain logic, persistence, and parsing.
- `src/task`: stored task domain logic and persistence.
- `src/dropper`: dropper domain logic, prompt rendering, and pointer movement.
- `src/file-utils`: shared filesystem, path, and validation helpers.
- `src/version`: package version lookup for the CLI.

## Dependency Direction

- `src/cli` is the orchestration layer and may depend on any non-CLI module.
- Non-CLI modules must not import from `src/cli`.
- `src/dropper` may depend on `src/fileset` and `src/task` when behavior
  requires those domain contracts.
- Shared filesystem and validation helpers belong in `src/file-utils` and may
  be reused by other modules.
- `src/version` should remain isolated and only expose version lookup helpers.

## Ownership Boundaries

- CLI-specific argument parsing, command help, and command output formatting
  belong in `src/cli`.
- Exit codes are a CLI contract and must be defined and mapped only in
  `src/cli`.
- Domain modules must throw semantic errors, not process-exit concerns.
- Each module should own its own public types, errors, and helpers instead of
  centralizing unrelated contracts.
- Cross-module imports should be narrow and come from the module that owns the
  behavior.

## Tests

- Keep tests next to the implementation in the module that owns the behavior.
- Prefer module-isolated tests over covering domain behavior indirectly through
  CLI integration tests.
- Unit tests should not depend on the real filesystem for setup or assertions.
- For filesystem-dependent behavior, expose deterministic seams with production
  defaults so tests can inject controlled behavior.
