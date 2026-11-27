---
name: test-receipt
description: "Use when you are about to say tests passed, tests pass, the suite is green, or 测试通过. Run test-receipt and claim success only if a fresh receipt for this commit and working tree has exit code 0. Otherwise say tests were not run or failed. Do not hand-write the receipt."
license: MIT
compatibility: "Requires Node.js 18+ and git on PATH. No network calls. The Stop hook is verified for Claude Code, Codex, and Qoder. Cursor claim checking is not yet supported."
metadata:
  author: Misslin1234
  version: "0.2.1"
---

# Test receipt

Never tell the user that tests passed, or that this change was tested, unless a fresh passing receipt exists for the current git commit and working tree.

A receipt is one local file, `.test-receipt/latest.json`. It records the command, the exit code, when it ran, and the git commit and dirty tree it ran against. It is not proof that the tests are meaningful. It is proof that those commands exited 0 on this tree.

## Find the CLI

Use the first one that exists:

1. In `.claude/settings.json`, `.codex/hooks.json`, or `.qoder/settings.json`, the Stop hook command (it ends with `hook`). Run that same program with `run` instead of `hook`.
2. `test-receipt` on `PATH`.
3. `node bin/cli.js` when the current repo is the test-receipt source checkout (`package.json` name is `test-receipt`).

If you cannot find it, say that tests were not run. Do not claim they passed.

Run it from the project root. Pass `--cwd` when the shell is somewhere else. Detection only looks at the root. Run `test-receipt detect` to see which command would run and why. That command does not run the tests and does not write a receipt.

`run` writes `.test-receipt/latest.json` in the directory it runs in. `check` and the Stop hook walk up from the working directory to the git toplevel and use the nearest receipt. A receipt outside that repository does not count. The fingerprint covers the whole repository and is taken after the commands finish.

## Rules

1. Before any success claim, run `test-receipt run` (or `node <cli> run`). Do not invent a test command when detection fails. Ask the user, or pass `--cmd` only for a command the user named.
2. Then run `test-receipt check`. You may say tests passed only when it prints `fresh: yes` and exits 0.
3. Name the command and the exit code in the reply. A fresh receipt is tied to one commit and one working tree. If you edit anything afterwards, the receipt is stale and the claim is false until you run again.
4. If the exit code is not 0, say the tests failed and include that code. Quote the useful part of `outputTail`. Do not soften it into a pass.
5. If you did not run them, say that in plain language: "tests were not run" or "测试没有运行".
6. Do not create or edit `.test-receipt/latest.json` yourself. A hand-written file can fool the hook. v1 does not sign receipts. Writing one by hand is a false claim.

## Phrases that need a fresh passing receipt

English examples: "tests pass", "tests passed", "all 12 tests passed", "the tests are passing", "npm test passed", "pytest passed", "no tests failed".

Chinese examples: "测试通过", "测试已通过", "全部测试通过", "单元测试通过", "测试成功", "测试都过了".

The Stop hook treats a sentence as a pass claim when it has a pass word and a test word and no negation. Pass words include pass, passed, passing, green, succeed, 通过, and 全绿. Test words include test, suite, pytest, jest, vitest, cargo test, go test, checks, 测试, and 用例. "I couldn't confirm that the tests pass.", "Not all tests pass.", and "Tests failed with exit code 1." are not claims. Some wording can still slip through. Follow this rule even when the hook stays silent. The hook does not check that a failure sentence is true.

## What fresh means

`fresh: yes` requires all of:

- `exitCode` is 0 and `ok` is true
- `git.commit` is the current `HEAD`
- `git.dirty` matches the current working tree
- `git.treeFingerprint` matches, including the contents of dirty files

A new commit, a new edit, or a failed run makes it not fresh. A directory that is not a git repo is never fresh.

## Config

If the detected command is wrong, add `.test-receipt.json` at the root:

```json
{ "commands": ["npm test"] }
```

Those shell commands replace detection. Every detected command runs, even after an earlier one fails.

## Hook

On Claude Code, Codex, and Qoder the Stop hook reads your final message. A pass claim without a fresh receipt blocks the stop and tells you to run the CLI or retract the claim. It does not run the tests for you.

If `stop_hook_active` is true, the hook does not block a second time. It only leaves a warning, so the host does not loop forever. Do not use that as a way to repeat the claim.

Cursor's documented `stop` event does not include the assistant message. Claim checking there is not yet supported. Do not parse the transcript to invent a Cursor hook.
