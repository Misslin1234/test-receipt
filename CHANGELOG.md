# Changelog

## 0.2.0 - 2026-11-27

- Detect Bun, Deno, Maven, Gradle, .NET, Ruby, and PHPUnit from marker files in the project root. Existing npm, pnpm, yarn, pytest, Go, Cargo, and Make detection is unchanged.
- `package.json` `scripts.test` still wins over `bun test` when an npm, pnpm, or yarn lockfile is present. A Bun lockfile with none of those lockfiles selects `bun test` instead, even if `scripts.test` or `packageManager` is set.
- `test-receipt detect` prints the command that would run and why, and does not run it. `--json` prints the same result, including a `reason` on each command.
- GitHub Actions runs `npm test` and `bash script/demo.sh` on Node 18 and 20.

## 0.1.0 - 2026-11-27

First release.

- Detect `npm test`, `pnpm test`, `yarn test`, `pytest`, `go test ./...`, `cargo test`, and `make test` from the project root.
- `test-receipt run` writes `.test-receipt/latest.json` with the command, exit code, start and end time, duration, git commit, and whether the working tree was dirty.
- Agent Skill that forbids claiming tests passed without a fresh exit-code-0 receipt for the current commit and tree.
- Stop hook for Claude Code. The same command shape is documented for Codex and Qoder. Cursor claim checking is not yet supported.
