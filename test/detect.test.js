"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detect, isPlaceholderTestScript } = require("../lib/detect");
const { tempDir, writeFile } = require("../support/helpers");

test("placeholder npm test script is ignored", () => {
  assert.equal(
    isPlaceholderTestScript('echo "Error: no test specified" && exit 1'),
    true
  );
  assert.equal(isPlaceholderTestScript("node --test"), false);
});

test("detects npm, pnpm, and yarn from lockfiles and packageManager", () => {
  const npmDir = tempDir();
  writeFile(
    npmDir,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" } })
  );
  writeFile(npmDir, "package-lock.json", "{}\n");
  assert.deepEqual(detect(npmDir).commands, [{ command: "npm test", source: "npm" }]);

  const pnpmDir = tempDir();
  writeFile(
    pnpmDir,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "npm@10.0.0" })
  );
  writeFile(pnpmDir, "pnpm-lock.yaml", "lockfileVersion: 9\n");
  assert.deepEqual(detect(pnpmDir).commands, [{ command: "pnpm test", source: "pnpm" }]);

  const yarnDir = tempDir();
  writeFile(yarnDir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(yarnDir, "yarn.lock", "# yarn\n");
  assert.deepEqual(detect(yarnDir).commands, [{ command: "yarn test", source: "yarn" }]);

  const fieldDir = tempDir();
  writeFile(
    fieldDir,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "pnpm@9.0.0" })
  );
  assert.deepEqual(detect(fieldDir).commands, [{ command: "pnpm test", source: "pnpm" }]);
});

test("skips the default npm test placeholder", () => {
  const dir = tempDir();
  writeFile(
    dir,
    "package.json",
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
  );
  assert.deepEqual(detect(dir).commands, []);
});

test("detects pytest, go, cargo, and make, and ignores a recipe named test", () => {
  const dir = tempDir();
  writeFile(dir, "pyproject.toml", "[tool.pytest.ini_options]\naddopts = -q\n");
  writeFile(dir, "go.mod", "module example.com/demo\n\ngo 1.22\n");
  writeFile(dir, "Cargo.toml", "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n");
  writeFile(dir, "Makefile", "all:\n\techo test:\n\ntest:\n\techo hi\n");
  assert.deepEqual(detect(dir).commands, [
    { command: "pytest", source: "pytest" },
    { command: "go test ./...", source: "go" },
    { command: "cargo test", source: "cargo" },
    { command: "make test", source: "make" },
  ]);
});

test("a Makefile without a top-level test target is not make test", () => {
  const dir = tempDir();
  writeFile(dir, "Makefile", "all:\n\techo test:\n");
  assert.deepEqual(detect(dir).commands, []);
});

test("pytest files are detected only when they look like tests", () => {
  const plain = tempDir();
  writeFile(plain, "app.py", "print('hi')\n");
  assert.deepEqual(detect(plain).commands, []);

  const tests = tempDir();
  writeFile(tests, "tests/test_add.py", "def test_add():\n    assert 1 + 1 == 2\n");
  assert.deepEqual(detect(tests).commands, [{ command: "pytest", source: "pytest" }]);
});

test("config commands replace detection", () => {
  const dir = tempDir();
  writeFile(dir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(dir, "go.mod", "module example.com/demo\n\ngo 1.22\n");
  writeFile(dir, ".test-receipt.json", JSON.stringify({ commands: ["npm test -- --run"] }));
  assert.deepEqual(detect(dir), {
    source: "config",
    commands: [{ command: "npm test -- --run", source: "config" }],
  });
});

test("a broken config file is an error", () => {
  const dir = tempDir();
  writeFile(dir, ".test-receipt.json", "{}\n");
  assert.throws(() => detect(dir), /commands/);
});
