"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decide } = require("../lib/hook");
const { execute } = require("../lib/run");
const { commitAll, initRepo, tempDir, writeFile } = require("../support/helpers");

const node = process.execPath;

async function passingProject() {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, ".gitignore", ".test-receipt/\n");
  writeFile(dir, "app.js", "module.exports = 1;\n");
  commitAll(dir, "init");
  await execute(dir, [{ command: node + ' -e "process.exit(0)"', source: "cli" }]);
  return dir;
}

function stopInput(cwd, message, extra = {}) {
  return {
    hook_event_name: "Stop",
    cwd,
    stop_hook_active: false,
    last_assistant_message: message,
    ...extra,
  };
}

test("missing, stale, and failed receipts block a pass claim", async () => {
  const missing = tempDir();
  initRepo(missing);
  writeFile(missing, "app.js", "module.exports = 1;\n");
  commitAll(missing, "init");
  const missingDecision = decide(stopInput(missing, "All tests pass."));
  assert.equal(missingDecision.blocked, true);
  assert.equal(missingDecision.output.decision, "block");
  assert.match(missingDecision.output.reason, /no-receipt/);

  const chinese = decide(stopInput(missing, "测试通过。"));
  assert.equal(chinese.output.decision, "block");

  const freshDir = await passingProject();
  assert.deepEqual(decide(stopInput(freshDir, "All tests pass.")).output, {});

  writeFile(freshDir, "app.js", "module.exports = 2;\n");
  const stale = decide(stopInput(freshDir, "Tests passed."));
  assert.equal(stale.output.decision, "block");
  assert.match(stale.output.reason, /dirty-mismatch/);

  const failedDir = tempDir();
  initRepo(failedDir);
  writeFile(failedDir, ".gitignore", ".test-receipt/\n");
  writeFile(failedDir, "app.js", "module.exports = 1;\n");
  commitAll(failedDir, "init");
  await execute(failedDir, [{ command: node + ' -e "process.exit(1)"', source: "cli" }]);
  const failed = decide(stopInput(failedDir, "npm test passed."));
  assert.equal(failed.output.decision, "block");
  assert.match(failed.output.reason, /exit-nonzero/);
});

test("honest failures and silence are allowed", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, "app.js", "1\n");
  commitAll(dir, "init");
  assert.deepEqual(decide(stopInput(dir, "Tests failed.")).output, {});
  assert.deepEqual(decide(stopInput(dir, "I did not run the tests.")).output, {});
  assert.deepEqual(decide(stopInput(dir, "")).output, {});
  assert.deepEqual(decide({ hook_event_name: "stop", cwd: dir, status: "completed", loop_count: 0 }).output, {});
});

test("stop_hook_active flags a repeated false claim without blocking again", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, "app.js", "1\n");
  commitAll(dir, "init");
  const decision = decide(stopInput(dir, "All tests pass.", { stop_hook_active: true }));
  assert.equal(decision.blocked, false);
  assert.equal(decision.output.decision, undefined);
  assert.match(decision.output.systemMessage, /stop_hook_active/);
  assert.match(decision.output.systemMessage, /no-receipt/);
});

test("a Cursor-shaped stop payload without the assistant message is allowed", () => {
  const dir = tempDir();
  initRepo(dir);
  writeFile(dir, "app.js", "1\n");
  commitAll(dir, "init");
  assert.deepEqual(
    decide({
      hook_event_name: "stop",
      cwd: dir,
      status: "completed",
      loop_count: 0,
    }).output,
    {}
  );
});
