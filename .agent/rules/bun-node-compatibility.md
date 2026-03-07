---
trigger: always_on
description: Use Bun for development speed but maintain Node.js compatibility for distribution.
globs: "*.ts, *.tsx, *.js, package.json, justfile"
---

# Bun and Node.js Compatibility Rules

This project uses Bun primarily as a development tool (test runner, task runner,
and bundler) while ensuring the compiled distribution artifacts remain fully
compatible with standard Node.js environments.

## Runtime APIs

- **Prohibited**: Do not use native Bun APIs (e.g., `Bun.file()`, `Bun.write()`,
  `Bun.serve()`, `Bun.sql`) in source code intended for the distribution build.
- **Required**: Use standard Node.js built-in modules (`node:fs/promises`,
  `node:path`, `node:http`) to ensure the compiled `dist/` bundle runs natively
  on any Node.js machine without requiring Bun to be installed.
- **Exception**: Bun native testing APIs (e.g.,
  `import { test, expect } from "bun:test"`) are fully allowed and encouraged
  inside `.test.ts` files, because test files are excluded from the distribution
  bundle.

## Toolchain and Workflow

- **Package Manager**: Use `bun install`, `bun add`, and `bun remove` instead of
  `npm`, `yarn`, or `pnpm`.
- **Task Runner**: Use `bun run <script>` instead of `npm run <script>`.
- **Test Runner**: Use `bun test` to execute test suites.
- **Building**: Use `bun build --target node` to generate the bundled Node.js
  compatible output. Any bundled output must explicitly declare Node.js as the
  target to omit Bun polyfills when unnecessary or flag incompatible API usage
  during compilation.

## Publishing

Ensure the compiled code behaves predictably on Node.js by avoiding any reliance
on silent Bun globals during development. If a feature works in
`bun run src/index.ts` but fails in `node dist/index.js`, the code must be
refactored to use Node.js standard APIs.
