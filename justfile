# Show help
help:
    @just --list

# Cross-compile for all supported platforms
build-all: build build-plugin build-linux-x64 build-windows-x64 build-macos-x64 build-macos-arm64

# Build the project into a single executable for the current platform
build: sync-version
    bun build ./src/index.ts --compile --outfile=dist/context-dropper

# Build the opencode plugin
build-plugin: sync-version
    cd opencode-plugin
    bun run build

# Remove build artifacts
clean:
    rm -rf dist

# Run the CLI
run *args:
    bun run ./src/index.ts {{args}}

# Cross-compile for Linux x64
build-linux-x64: sync-version
    bun build ./src/index.ts --compile --target=bun-linux-x64 --outfile=dist/context-dropper-linux-x64

# Cross-compile for Windows x64
build-windows-x64: sync-version
    bun build ./src/index.ts --compile --target=bun-windows-x64 --outfile=dist/context-dropper-windows-x64.exe

# Cross-compile for macOS x64
build-macos-x64: sync-version
    bun build ./src/index.ts --compile --target=bun-darwin-x64 --outfile=dist/context-dropper-macos-x64

# Cross-compile for macOS arm64
build-macos-arm64: sync-version
    bun build ./src/index.ts --compile --target=bun-darwin-arm64 --outfile=dist/context-dropper-macos-arm64

# Run all tests, formatting checks, and typechecks
test: fmt-check
    bunx tsc --noEmit
    bun test

    cd opencode-plugin
    bunx tsc --noEmit
    bun test

# Publish packages to NPM with provenance
publish: test build-all
    bun pm pack
    npm publish *.tgz --provenance --access public
    rm *.tgz

    cd opencode-plugin && bun pm pack
    cd opencode-plugin && npm publish *.tgz --provenance --access public
    cd opencode-plugin && rm *.tgz

# Upgrade dependencies in root and plugin
upgrade:
    bun update

    cd opencode-plugin
    bun update

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

# Synchronize version from VERSION.txt to package.json files
sync-version:
    #!/usr/bin/env bun

    const file = Bun.file("VERSION.txt");
    if (!(await file.exists())) process.exit(0);

    const version = (await file.text()).trim().replace(/^v/, "");
    let changed = false;
    for (const path of ["package.json", "opencode-plugin/package.json"]) {
      const pJson = Bun.file(path);
      const data = await pJson.json();
      if (data.version !== version) {
        data.version = version;
        await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
        const { stdout, stderr, exitCode } = await Bun.spawn(["dprint", "fmt", path]);
        console.log(`Synchronized ${path} to version ${version}`);
        changed = true;
      }
    }
    
    if (changed) {
      console.log("Updating lock files...");
      await Bun.spawn(["bun", "install"], { stdout: "inherit", stderr: "inherit" });
      await Bun.spawn(["bun", "install"], { cwd: "opencode-plugin", stdout: "inherit", stderr: "inherit" });
    }
