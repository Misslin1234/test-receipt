"use strict";

const path = require("node:path");
const { claimsTestsPassed } = require("./claims");
const { resolveCwd } = require("./cwd");
const { evaluate } = require("./receipt");

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text;
  return '"' + text.replace(/"/g, '\\"') + '"';
}

function commandPrefix(cliPath) {
  if (!cliPath) return "test-receipt";
  return "node " + shellQuote(path.resolve(cliPath));
}

function explain(status, cliPath) {
  const bin = commandPrefix(cliPath);
  const recorded = status.receipt && status.receipt.git ? status.receipt.git : null;
  const lines = [
    "test-receipt: do not claim tests passed.",
    "Status: " + status.reason + ". " + status.detail,
    recorded
      ? "Recorded commit: " +
        (recorded.commit || "(none)") +
        " dirty=" +
        recorded.dirty +
        " exitCode=" +
        status.receipt.exitCode
      : "Recorded commit: (no receipt)",
    "Current commit: " +
      (status.git && status.git.commit ? status.git.commit : "(none)") +
      " dirty=" +
      (status.git ? status.git.dirty : "(unknown)"),
    "Receipt file: " + status.receiptPath,
    "Run: " + bin + " run",
    "You may say tests passed only when that command exits 0 and `" +
      bin +
      " check` prints fresh: yes for this same commit and working tree.",
    "Otherwise say plainly that tests were not run, or that they failed, and include the exit code.",
    'Do not say "tests pass", "tests passed", or "测试通过" without a fresh passing receipt.',
    "Do not write .test-receipt/latest.json by hand.",
  ];
  return lines.join("\n");
}

function allow() {
  return { blocked: false, flagged: false, output: {} };
}

function decide(input, options = {}) {
  const event = input && input.hook_event_name;
  if (event && !/^stop$/i.test(String(event)) && !/^subagentstop$/i.test(String(event))) {
    return allow();
  }

  const message = input && typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
  if (!claimsTestsPassed(message)) return allow();

  let status;
  try {
    status = evaluate(resolveCwd(input && input.cwd));
  } catch (err) {
    return {
      blocked: false,
      flagged: true,
      output: {
        systemMessage: "test-receipt could not check the receipt: " + (err.message || String(err)),
      },
    };
  }

  if (status.fresh) return allow();

  const reason = explain(status, options.cliPath);
  if (input && input.stop_hook_active === true) {
    return {
      blocked: false,
      flagged: true,
      output: {
        systemMessage:
          "test-receipt: the message still claims tests passed (" +
          status.reason +
          ") but this stop is allowed because stop_hook_active is true, which avoids an infinite loop. " +
          reason,
      },
    };
  }

  return {
    blocked: true,
    flagged: false,
    output: {
      decision: "block",
      reason,
    },
  };
}

function hookSettings(cliPath) {
  return {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: commandPrefix(cliPath) + " hook",
              timeout: 20,
            },
          ],
        },
      ],
    },
  };
}

const HOOK_FILES = {
  claude: ".claude/settings.json",
  codex: ".codex/hooks.json",
  qoder: ".qoder/settings.json",
};

module.exports = {
  decide,
  explain,
  hookSettings,
  shellQuote,
  HOOK_FILES,
};
