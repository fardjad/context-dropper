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
build-all: build build-plugin build-release-binaries

# Build the project into a single executable for the current platform
build:
    bun build ./src/index.ts --compile --outfile=dist/context-dropper

# Build the opencode plugin
build-plugin:
    cd opencode-plugin
    bun run build

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

# Run all tests, formatting checks, and typechecks
test: check-fmt
    bunx tsc --noEmit
    bun test

    cd opencode-plugin
    bunx tsc --noEmit
    bun test

# Publish the root package to NPM with provenance
publish-root: test build
    bun pm pack
    npm publish *.tgz --provenance --access public
    rm *.tgz

# Publish the OpenCode plugin package to NPM with provenance
publish-plugin: test build-plugin
    cd opencode-plugin && bun pm pack
    cd opencode-plugin && npm publish *.tgz --provenance --access public
    cd opencode-plugin && rm *.tgz

# Publish all packages to NPM with provenance
publish: publish-root publish-plugin

# Upgrade dependencies in root and plugin
upgrade:
    bun update

    cd opencode-plugin
    bun update

# Format code
fmt:
    dprint fmt

# Check code formatting
check-fmt:
    dprint check

# Test zsh completion interactively
test-completion-zsh: build
    @echo "Starting a subshell to test zsh completion. Type 'exit' to leave."
    @TMPDIR=$(mktemp -d) && \
    echo 'export PATH="'$(pwd)'/dist:$PATH"' > "$TMPDIR/.zshrc" && \
    echo 'autoload -Uz compinit && compinit' >> "$TMPDIR/.zshrc" && \
    SHELL=/bin/zsh ./dist/context-dropper completion >> "$TMPDIR/.zshrc" && \
    ZDOTDIR="$TMPDIR" zsh -i; \
    rm -rf "$TMPDIR"
