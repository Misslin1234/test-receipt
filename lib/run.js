"use strict";

const { spawn } = require("node:child_process");
const { SCHEMA_VERSION } = require("./constants");
const { ensureGitignore, gitState } = require("./git");
const { writeReceipt } = require("./receipt");
const { version } = require("../package.json");

const TAIL_LIMIT = 2000;

function runOne(command, cwd) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    let settled = false;
    const finish = (exitCode, extra) => {
      if (settled) return;
      settled = true;
      const endedAt = new Date();
      resolve({
        exitCode,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        outputTail: String(extra || "").slice(-TAIL_LIMIT),
      });
    };

    let tail = "";
    const take = (chunk) => {
      tail += chunk.toString("utf8");
      if (tail.length > TAIL_LIMIT * 4) tail = tail.slice(-TAIL_LIMIT * 2);
    };

    let child;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        env: process.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finish(127, err && err.message ? err.message : err);
      return;
    }

    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (err) => finish(127, err && err.message ? err.message : err));
    child.on("close", (code) => finish(code === null ? 1 : code, tail));
  });
}

async function execute(cwd, commands) {
  ensureGitignore(cwd);
  const startedAt = new Date();
  const results = [];
  for (const item of commands) {
    const one = await runOne(item.command, cwd);
    results.push({
      command: item.command,
      source: item.source,
      exitCode: one.exitCode,
      startedAt: one.startedAt,
      endedAt: one.endedAt,
      durationMs: one.durationMs,
      outputTail: one.outputTail,
    });
  }
  const endedAt = new Date();
  const git = gitState(cwd);
  const firstBad = results.find((item) => item.exitCode !== 0);
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    tool: "test-receipt",
    toolVersion: version,
    ok: !firstBad,
    exitCode: firstBad ? firstBad.exitCode : 0,
    command: results.map((item) => item.command).join("; "),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    commands: results,
    git: {
      inGit: git.inGit,
      commit: git.commit,
      dirty: git.dirty,
      treeFingerprint: git.treeFingerprint,
    },
  };
  const written = writeReceipt(cwd, receipt);
  return { receipt, receiptPath: written, git };
}

module.exports = { execute, runOne, TAIL_LIMIT };
