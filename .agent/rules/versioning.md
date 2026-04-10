---
trigger: always_on
---

# Versioning Rules

These rules define how versions are managed across the projects in this
repository.

## 1. Independent Package Versions

- Each package's own `package.json` file is the source of truth for that
  package's version.
- The root package version is defined only in `package.json`.
- The OpenCode plugin package version is defined only in
  `opencode-plugin/package.json`.
- Package versions must not be synchronized through a shared version file.

## 2. Version Bumps

- Use `bun pm version <increment> --no-git-tag-version` from the package
  directory whose version is being changed.
- Dependency maintenance for a package must bump only that package's version.
- Release tags must include the package identity so independently versioned
  packages do not collide.
