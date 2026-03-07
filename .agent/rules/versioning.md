---
trigger: always_on
---

# Versioning Rules

These rules define how versions are managed and synchronized across the projects
in this repository.

## 1. The Source of Truth

- **`VERSION.txt` File**: The `VERSION.txt` file located at the root of the
  repository is the definitive and single source of truth for the project's
  current version.
- **Tag and Package Matching**: The version defined in `VERSION.txt` dictates
  all versions in package.json files.
