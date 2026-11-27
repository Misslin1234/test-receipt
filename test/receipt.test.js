"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { gitState, parsePorcelainZ } = require("../lib/git");
const { evaluate } = require("../lib/receipt");
const { execute, TAIL_LIMIT } = require("../lib/run");
const { commitAll, initRepo, tempDir, writeFile } = require("../support/helpers");

const node = process.execPath;

test("porcelain -z splits renames on NUL", () => {
  const entries = parsePorcelainZ("R  old\0new\0 M src/a.js\0");
  assert.deepEqual(entries, [
    { xy: "R ", path: "new", from: "old" },
    { xy: " M", path: "src/a.js" },
  ]);
});

test("fingerprint tracks dirty file contents and ignores gitignored files", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", "ignored.txt\n.test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");

  const clean = gitState(dir);
  assert.equal(clean.dirty, false);
  assert.equal(gitState(dir).treeFingerprint, clean.treeFingerprint);

  writeFile(dir, "ignored.txt", "noise\n");
  assert.equal(gitState(dir).treeFingerprint, clean.treeFingerprint);

  writeFile(dir, "app.js", "module.exports = 2;\n");
  const dirty = gitState(dir);
  assert.equal(dirty.dirty, true);
  assert.notEqual(dirty.treeFingerprint, clean.treeFingerprint);

  writeFile(dir, "app.js", "module.exports = 3;\n");
  assert.notEqual(gitState(dir).treeFingerprint, dirty.treeFingerprint);
});

test("a passing run writes a fresh receipt and a later edit makes it stale", async () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");

  const result = await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  assert.equal(result.receipt.ok, true);
  assert.equal(result.receipt.exitCode, 0);
  assert.equal(typeof result.receipt.startedAt, "string");
  assert.equal(typeof result.receipt.endedAt, "string");
  assert.equal(typeof result.receipt.durationMs, "number");
  assert.equal(result.receipt.git.commit, gitState(dir).commit);
  assert.equal(result.receipt.git.dirty, false);
  assert.equal(evaluate(dir).reason, "fresh");

  writeFile(dir, "app.js", "module.exports = 2;\n");
  assert.equal(evaluate(dir).reason, "dirty-mismatch");
});

test("a failing command still writes a receipt and does not count as fresh", async () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");

  const result = await execute(dir, [{ command: node + ' -e "process.exit(3)"', source: "cli" }]);
  assert.equal(result.receipt.ok, false);
  assert.equal(result.receipt.exitCode, 3);
  assert.equal(evaluate(dir).reason, "exit-nonzero");
});

test("outside a git repo the receipt cannot be fresh", async () => {
  const dir = tempDir();
  writeFile(dir, "app.js", "module.exports = 1;\n");
  await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  assert.equal(fs.existsSync(path.join(dir, ".test-receipt", "latest.json")), true);
  assert.equal(evaluate(dir).reason, "not-a-git-repo");
});

test("the first run adds one gitignore entry and a second run does not duplicate it", async () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");
  await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  const lines = fs
    .readFileSync(path.join(dir, ".gitignore"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() === ".test-receipt/");
  assert.equal(lines.length, 1);
  assert.equal(evaluate(dir).fresh, true);
});

test("outputTail keeps the end of long output", async () => {
  const dir = tempDir();
  const result = await execute(dir, [
    {
      command: node + " -e \"process.stdout.write('A'.repeat(5000)+'END')\"",
      source: "cli",
    },
  ]);
  assert.ok(result.receipt.commands[0].outputTail.endsWith("END"));
  assert.ok(result.receipt.commands[0].outputTail.length <= TAIL_LIMIT);
});

test("a command that writes an unignored file still leaves a fresh receipt", async () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");

  await execute(dir, [
    {
      command: node + " -e \"require('fs').writeFileSync('coverage.txt','cov')\"",
      source: "cli",
    },
  ]);
  assert.equal(evaluate(dir).reason, "fresh");

  writeFile(dir, "app.js", "module.exports = 2;\n");
  assert.equal(evaluate(dir).reason, "fingerprint-mismatch");
});

test("a new commit invalidates the receipt", async () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");
  await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  writeFile(dir, "app.js", "module.exports = 2;\n");
  commitAll(dir, "edit");
  assert.equal(evaluate(dir).reason, "commit-mismatch");
});
