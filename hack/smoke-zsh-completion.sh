#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bun run build:standalone

echo 'Starting a subshell to test zsh completion. Type "exit" to leave.'

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

printf 'export PATH="%s/dist:$PATH"\n' "$PWD" > "${tmpdir}/.zshrc"
echo "autoload -Uz compinit && compinit" >> "${tmpdir}/.zshrc"
SHELL=/bin/zsh ./dist/context-dropper completion >> "${tmpdir}/.zshrc"
ZDOTDIR="${tmpdir}" zsh -i
