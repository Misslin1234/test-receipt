"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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
  assert.match(help.stdout, /nearest receipt/);

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
  assert.doesNotMatch(ran.stderr, /can never be fresh/);
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

test("detect prints the command and why without running it", () => {
  const dir = tempDir();
  writeFile(
    dir,
    "package.json",
    JSON.stringify({
      scripts: {
        test: "node -e \"require('fs').writeFileSync('ran.txt','1'); process.exit(1)\"",
      },
    })
  );
  writeFile(dir, "package-lock.json", "{}\n");
  writeFile(dir, "pom.xml", "<project></project>\n");
  writeFile(dir, "mvnw", "#!/bin/sh\n");

  const human = run(["detect", "--cwd", dir]);
  assert.equal(human.status, 0, human.stderr);
  assert.equal(human.stderr, "");
  assert.match(human.stdout, /detection: detect/);
  assert.match(human.stdout, /would run: npm test/);
  assert.match(human.stdout, /why: package.json scripts.test and package-lock.json/);
  assert.match(human.stdout, /would run: \.\/mvnw test/);
  assert.match(human.stdout, /why: pom.xml and mvnw/);
  assert.equal(fs.existsSync(path.join(dir, "ran.txt")), false);

  const json = run(["detect", "--cwd", dir, "--json"]);
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.source, "detect");
  assert.deepEqual(
    parsed.commands.map((item) => item.command),
    ["npm test", "./mvnw test"]
  );
  assert.equal(parsed.commands[0].reason, "package.json scripts.test and package-lock.json");
  assert.equal(parsed.commands[1].reason, "pom.xml and mvnw");
  assert.equal(fs.existsSync(path.join(dir, "ran.txt")), false);

  const ruby = tempDir();
  writeFile(ruby, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(ruby, "spec/example_spec.rb", "\n");
  const rubyOut = run(["detect", "--cwd", ruby]);
  assert.equal(rubyOut.status, 0, rubyOut.stderr);
  assert.match(rubyOut.stdout, /would run: bundle exec rspec/);
  assert.match(rubyOut.stdout, /why: Gemfile and spec\//);

  const empty = run(["detect", "--cwd", tempDir()]);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /would run: \(none\)/);
  assert.match(empty.stderr, /no test command detected/);
});

test("run outside a git repo warns that the receipt can never be fresh", () => {
  const dir = tempDir();
  writeFile(dir, "app.js", "1\n");
  const ran = run(["run", "--cwd", dir, "--cmd", process.execPath + ' -e "process.exit(0)"']);
  assert.equal(ran.status, 0, ran.stderr);
  const warnings = ran.stderr.split(/\n/).filter((line) => /can never be fresh/.test(line));
  assert.deepEqual(warnings, ["warning: the receipt can never be fresh outside a git repository."]);
});

test("the published package includes CHANGELOG.md", () => {
  const pkg = require("../package.json");
  assert.ok(pkg.files.includes("CHANGELOG.md"));
  assert.equal(pkg.version, "0.2.1");
});

test("invalid hook JSON fail-opens", () => {
  const hook = run(["hook"], { input: "not-json" });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout.trim(), "{}");
  assert.match(hook.stderr, /not JSON/);
});
