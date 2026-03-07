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

# Cross-compile binaries for all supported release targets
build-release-binaries: sync-version
    #!/usr/bin/env bash
    set -euo pipefail

    ARTIFACTS=()
    for TARGET_MAP in {{release_targets}}; do
        TARGET="${TARGET_MAP%%:*}"
        OUTFILE="${TARGET_MAP##*:}"
        
        echo "Building $TARGET -> $OUTFILE" >&2
        bun build ./src/index.ts --compile --target=$TARGET --outfile=$OUTFILE >&2
        ARTIFACTS+=("$OUTFILE")
    done

    # Output the list of artifacts so CI pipelines can consume it
    echo "${ARTIFACTS[*]}"

# Run all tests, formatting checks, and typechecks
test: check-fmt check-version-sync
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

# Check if version in VERSION.txt matches package.json files
check-version-sync:
    #!/usr/bin/env bun

    const file = Bun.file("VERSION.txt");
    if (!(await file.exists())) process.exit(0);

    const version = (await file.text()).trim().replace(/^v/, "");
    let outOfSync = false;
    for (const path of ["package.json", "opencode-plugin/package.json"]) {
      const pJson = Bun.file(path);
      const data = await pJson.json();
      if (data.version !== version) {
        console.error(`Error: Version mismatch in ${path}. Expected ${version}, found ${data.version}. Run 'just sync-version' to fix.`);
        outOfSync = true;
      }
    }
    
    if (outOfSync) {
      process.exit(1);
    }
    console.log(`Versions are in sync (${version}).`);
