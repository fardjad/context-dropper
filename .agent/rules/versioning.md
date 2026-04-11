---
trigger: always_on
---

# Versioning Rules

These rules define how versions are managed across the projects in this
repository.

## 1. Independent Package Versions

- There are two separate packages in this repository, the CLI and the 
  opencode-plugin. They both have their own versions. 
- This repository follows semantic versioning. 
- Before version 1.x.x, Minor versions must be in sync. For >=1.x.x, major 
  versions must be kept in sync.
- When upgrading dependencies, just bump the patch versions. 

## 2. Version Bumps

- Use `bun pm version <increment> --no-git-tag-version` from the package
  directory whose version is being changed.
- Dependency maintenance for a package must bump only that package's version.
- Release tags must include the package identity so independently versioned
  packages do not collide.
