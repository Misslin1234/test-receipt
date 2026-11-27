"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { commitAll, initRepo, tempDir, writeFile } = require("../support/helpers");

const cli = path.join(__dirname, "..", "bin", "cli.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
  });
}

test("help and print-hook", () => {
  const help = run([]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /test-receipt run/);

  const claude = run(["print-hook", "claude"]);
  assert.equal(claude.status, 0);
  const settings = JSON.parse(claude.stdout);
  assert.equal(settings.hooks.Stop[0].hooks[0].type, "command");
  assert.match(settings.hooks.Stop[0].hooks[0].command, /bin\/cli\.js hook$/);
  assert.match(claude.stderr, /\.claude\/settings\.json/);

  const cursor = run(["print-hook", "cursor"]);
  assert.equal(cursor.status, 2);
  assert.match(cursor.stderr, /not yet supported/);
});

test("check and hook agree on a missing receipt", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, "app.js", "1\n");
  commitAll(dir, "init");

  const check = run(["check", "--cwd", dir, "--json"]);
  assert.equal(check.status, 1);
  assert.equal(JSON.parse(check.stdout).reason, "no-receipt");

  const allowed = run(["check", "--cwd", dir, "--message", "I did not run the tests."]);
  assert.equal(allowed.status, 0);
  assert.match(allowed.stdout, /allowClaim: yes/);

  const hook = run(["hook"], {
    cwd: tempDir(),
    input: JSON.stringify({
      hook_event_name: "Stop",
      cwd: dir,
      stop_hook_active: false,
      last_assistant_message: "All tests pass.",
    }),
  });
  assert.equal(hook.status, 0);
  assert.equal(JSON.parse(hook.stdout).decision, "block");
  assert.equal(hook.stdout.trim().startsWith("{"), true);
  assert.equal(hook.stdout.trim().endsWith("}"), true);
});

test("run then check is fresh for a passing command", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "1\n");
  commitAll(dir, "init");
  const ran = run(["run", "--cwd", dir, "--cmd", process.execPath + ' -e "process.exit(0)"']);
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /ok: yes/);
  const check = run(["check", "--cwd", dir]);
  assert.equal(check.status, 0, check.stdout);
  assert.match(check.stdout, /fresh: yes/);

  const hook = run(["hook"], {
    cwd: tempDir(),
    input: JSON.stringify({
      hook_event_name: "Stop",
      cwd: dir,
      stop_hook_active: false,
      last_assistant_message: "All tests pass.",
    }),
  });
  assert.equal(hook.status, 0, hook.stdout);
  assert.equal(hook.stdout.trim(), "{}");
});

test("invalid hook JSON fail-opens", () => {
  const hook = run(["hook"], { input: "not-json" });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout.trim(), "{}");
  assert.match(hook.stderr, /not JSON/);
});
