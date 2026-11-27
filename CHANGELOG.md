# Changelog

## 0.2.1 - 2026-11-27

- The tree fingerprint is taken after test commands finish. A command that writes an un-ignored file, such as coverage.txt, can still leave a fresh receipt. A later edit makes `check` stale.
- `check` and the Stop hook fingerprint the whole git repository from its toplevel. A content edit under `--cwd`, and an edit outside that directory, both change the fingerprint. Any `.test-receipt/` directory is excluded.
- `check` and the Stop hook find the nearest `.test-receipt/latest.json` by walking up from the working directory to the git toplevel. `run` still writes the receipt in the directory it runs in.
- A pass claim is a sentence with a pass word and a test word and no negation or uncertainty. Paraphrases such as "everything passes" and "测试全绿" are caught. "Not all tests pass.", "No tests passed.", and "Tests failed with exit code 1." stay allowed.
- `run` outside a git repository prints one warning that the receipt can never be fresh.
- The published package includes CHANGELOG.md.

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
