# Show help
help:
    @just --list

# Cross-compile for all supported platforms
build-all: build build-linux-x64 build-windows-x64 build-macos-x64 build-macos-arm64

# Build the project into a single executable for the current platform
build:
    bun build ./src/index.ts --compile --outfile=dist/context-dropper

# Remove build artifacts
clean:
    rm -rf dist

# Run the CLI
run *args:
    bun run ./src/index.ts {{args}}

# Cross-compile for Linux x64
build-linux-x64:
    bun build ./src/index.ts --compile --target=bun-linux-x64 --outfile=dist/context-dropper-linux-x64

# Cross-compile for Windows x64
build-windows-x64:
    bun build ./src/index.ts --compile --target=bun-windows-x64 --outfile=dist/context-dropper-windows-x64.exe

# Cross-compile for macOS x64
build-macos-x64:
    bun build ./src/index.ts --compile --target=bun-darwin-x64 --outfile=dist/context-dropper-macos-x64

# Cross-compile for macOS arm64
build-macos-arm64:
    bun build ./src/index.ts --compile --target=bun-darwin-arm64 --outfile=dist/context-dropper-macos-arm64

# Run tests
test:
    bun test

# Format code
fmt:
    dprint fmt

# Check code formatting
fmt-check:
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
