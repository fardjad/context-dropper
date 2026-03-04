---
trigger: always_on
description: Favor codemogger MCP for code searching and ensure reindexing before use.
globs: "**/*"
---

# Codemogger Search Rules

When searching for code, especially for semantic understanding or natural language queries, favor the `context-eyedropper-codemogger` MCP tools.

## Search Protocol

1. **Reindex First**: ALWAYS run `codemogger_reindex` before performing any search or lookup to ensure results are based on the latest state of the codebase.
2. **Semantic Search**: Use `codemogger_search` with the query and appropriate context for natural language searches ("how is X implemented", "where is the logic for Y").
3. **Keyword Search**: Use `codemogger_search` for precise identifier lookups (functions, classes, variables).

## Tools

- `codemogger_index`: Use this if the project hasn't been indexed yet.
- `codemogger_reindex`: Use this before every search session to update the index.
- `codemogger_search`: The primary tool for semantic and keyword search.

Prefer `codemogger` over `ripgrep` or `grep_search` when you need to understand the relationship between components or find definitions across many files.