# Changelog

## 0.1.0 - 2026-11-27

First release.

- Detect `npm test`, `pnpm test`, `yarn test`, `pytest`, `go test ./...`, `cargo test`, and `make test` from the project root.
- `test-receipt run` writes `.test-receipt/latest.json` with the command, exit code, start and end time, duration, git commit, and whether the working tree was dirty.
- Agent Skill that forbids claiming tests passed without a fresh exit-code-0 receipt for the current commit and tree.
- Stop hook for Claude Code. The same command shape is documented for Codex and Qoder. Cursor claim checking is not yet supported.
