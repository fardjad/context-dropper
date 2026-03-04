---
trigger: always_on
---

# File Formatting Rules

These rules define required formatter behavior for repository source and config
files. This rule governs file formatting only and does not define runtime,
dependency, or build toolchain policy.

## 1. dprint-Supported File Types

- `dprint` is the primary formatter for this repository.
- Supported file types include:
  - Markdown (`.md`)
  - TOML (`.toml`)
  - YAML (`.yml`, `.yaml`)
  - JavaScript and TypeScript files (`.js`, `.jsx`, `.cjs`, `.mjs`, `.ts`, `.tsx`, `.cts`, `.mts`)
  - JSON files (`.json`, `.jsonc`)
- Formatter behavior is defined in `dprint.json`.

## 2. Specific Formatter Assignments

- `Dockerfile` files must be formatted with `dockerfmt`.
- `justfile` files must be formatted with Just's built-in formatter.
- `compose.yml` files must be linted and auto-fixed with `dclint`.
- Shell scripts must be formatted with `shfmt` in simplified style mode.

## 3. Conflict Resolution

- `dprint` has priority for all file types it supports.
- If a file type is not supported by `dprint`, use the specific formatter listed in Section 2.
- If more than one formatter can apply and neither is `dprint`, stop and ask the user.

## 4. Consistency Requirements

- Do not hand-format files in ways that conflict with these formatters.
- Formatting changes must be deterministic and idempotent.
- When editing a file, keep it compliant with the formatter for its file type.
- Run `dprint fmt` regularly to ensure repository-wide consistency.
