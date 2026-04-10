# Show help
help:
    @just --list

release_targets := \
    "bun-linux-x64:dist/context-dropper-linux-x64 " + \
    "bun-windows-x64:dist/context-dropper-windows-x64.exe " + \
    "bun-darwin-x64:dist/context-dropper-macos-x64 " + \
    "bun-darwin-arm64:dist/context-dropper-macos-arm64 " + \
    "bun-linux-arm64:dist/context-dropper-linux-arm64 " + \
    "bun-windows-arm64:dist/context-dropper-windows-arm64.exe"

# Cross-compile for all supported platforms
build-all: build build-release-binaries

# Build all package artifacts for the current platform
build: build-cli build-plugin

# Build the CLI into a single executable for the current platform
build-cli:
    bun build ./src/index.ts --compile --outfile=dist/context-dropper

# Build the opencode plugin
build-plugin:
    cd opencode-plugin && bun run build

# Remove build artifacts
clean:
    rm -rf dist

# Run the CLI
run *args:
    bun run ./src/index.ts {{ args }}

# Cross-compile binaries for all supported release targets
build-release-binaries:
    #!/usr/bin/env bash
    set -euo pipefail

    ARTIFACTS=()
    for TARGET_MAP in {{ release_targets }}; do
        TARGET="${TARGET_MAP%%:*}"
        OUTFILE="${TARGET_MAP##*:}"

        echo "Building $TARGET -> $OUTFILE" >&2
        bun build ./src/index.ts --compile --target=$TARGET --outfile=$OUTFILE >&2
        ARTIFACTS+=("$OUTFILE")
    done

    # Output the list of artifacts so CI pipelines can consume it
    echo "${ARTIFACTS[*]}"

# Run CLI tests, formatting checks, and typechecks
test-cli: check-fmt
    bunx tsc --noEmit
    find src -name '*.test.ts' -print0 | xargs -0 bun test

# Run OpenCode plugin tests, formatting checks, and typechecks
test-plugin: check-fmt
    cd opencode-plugin && bunx tsc --noEmit
    cd opencode-plugin && find src -name '*.test.ts' -print0 | xargs -0 bun test

# Run all tests, formatting checks, and typechecks
test: test-cli test-plugin

# Publish the root package to NPM with provenance
publish-cli: test-cli build-cli
    bun pm pack
    npm publish *.tgz --provenance --access public
    rm *.tgz

# Publish the OpenCode plugin package to NPM with provenance
publish-plugin: test build-plugin
    cd opencode-plugin && bun pm pack
    cd opencode-plugin && npm publish *.tgz --provenance --access public
    cd opencode-plugin && rm *.tgz

# Publish all packages to NPM with provenance
publish: publish-cli publish-plugin

# Format code
fmt:
    dprint fmt

# Check code formatting
check-fmt:
    dprint check

# Test zsh completion interactively
test-completion-zsh: build-cli
    @echo "Starting a subshell to test zsh completion. Type 'exit' to leave."
    @TMPDIR=$(mktemp -d) && \
    echo 'export PATH="'$(pwd)'/dist:$PATH"' > "$TMPDIR/.zshrc" && \
    echo 'autoload -Uz compinit && compinit' >> "$TMPDIR/.zshrc" && \
    SHELL=/bin/zsh ./dist/context-dropper completion >> "$TMPDIR/.zshrc" && \
    ZDOTDIR="$TMPDIR" zsh -i; \
    rm -rf "$TMPDIR"
