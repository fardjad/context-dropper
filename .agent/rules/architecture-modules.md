---
trigger: always_on
description: Enforce module boundaries and isolated testing for CLI architecture.
---

# Module Architecture Rules

These rules define source layout and dependency boundaries for repository modules.

## 1. Module Layout

- Place runtime code under `src/` in module directories.
- Required modules are:
  - `src/cli`
  - `src/fileset`
  - `src/dropper`
  - `src/file-utils`

## 2. CLI Dependency Direction

- `src/cli` is an orchestration module and may depend on other modules.
- Non-CLI modules must not import from `src/cli`.
- CLI-specific types, argument parsing, and command wiring must remain in `src/cli`.

## 3. Fileset Module

- All fileset-specific logic, types, and tests must live in `src/fileset`.
- Fileset concerns must not be implemented in `src/cli` except command wiring.

## 4. Dropper Module

- All dropper-specific logic, types, and tests must live in `src/dropper`.
- `src/dropper` may depend on `src/fileset` when required by behavior.
- Dropper concerns must not be implemented in `src/cli` except command wiring.

## 5. File Utilities Module

- Shared filesystem/path/name validation helpers must live in `src/file-utils`.
- Filename and path normalization logic must be implemented in `src/file-utils` and reused by other modules.

## 6. Module Self-Containment

- Each module must own its public types, errors, and helpers.
- Avoid central shared type registries that mix unrelated module contracts.
- Cross-module dependencies must import only what is needed from the owning module.

## 7. Error Code Ownership

- Exit codes are a CLI contract and must be defined only in `src/cli`.
- Non-CLI modules must not encode process exit codes in error types or helpers.
- Non-CLI modules must throw semantic/domain errors only.
- CLI must map semantic errors to exit codes in a dedicated mapper module.

## 8. Test Placement and Isolation

- Place tests next to implementation files inside the owning module directory.
- Module tests must validate module behavior in isolation from CLI wiring.
- CLI tests may validate command integration but must not replace module-isolated tests.

## 9. Test Scope and Seams

- Do not add unit tests for trivial class declarations or constructor-only wrappers.
- Unit tests must not depend on the real filesystem for setup or assertions.
- For filesystem-dependent logic, expose functional seams (dependency injection points) with defaults bound to production implementations.
- Tests must use those seams to provide deterministic mock behavior they control.
