---
trigger: always_on
---

# Versioning Rules

These rules define how versions are managed for this repository.

## 1. Package Version

- This repository publishes a package: `context-dropper`.
- This repository follows semantic versioning.
- When releasing a new version, analyze the changes and bump the version 
  according to semantic versioning rules.

## 2. Version Bumps

- Use `bun pm version <increment> --no-git-tag-version` from the repository
  root.
- Release tags must use the `v<version>` format.
