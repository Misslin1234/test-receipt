#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { claimsTestsPassed } = require("../lib/claims");
const { resolveCwd } = require("../lib/cwd");
const { detect } = require("../lib/detect");
const { UserError } = require("../lib/errors");
const { decide, hookSettings, HOOK_FILES } = require("../lib/hook");
const { evaluate } = require("../lib/receipt");
const { execute } = require("../lib/run");

const HELP = `test-receipt — 先跑测试，再允许说「测试通过」 / run tests before claiming they passed

Usage:
  test-receipt detect [--cwd DIR]
  test-receipt run [--cwd DIR] [--cmd COMMAND]...
  test-receipt check [--cwd DIR] [--message TEXT] [--json]
  test-receipt hook
  test-receipt print-hook claude|codex|qoder|cursor

detect   Print which test commands would run, and why. Does not run them.
         --json prints the same result as JSON. Each command includes reason.
run      Run those commands and write .test-receipt/latest.json.
check    Exit 0 only when a fresh passing receipt matches this commit and tree.
         With --message, exit 0 when that text does not claim tests passed,
         or when the claim has a fresh passing receipt.
hook     Read a Stop-hook JSON object from stdin and print a decision.
print-hook
         Print a settings snippet. Cursor claim checking is not yet supported.

A receipt is fresh only when exit code is 0, the git commit matches, and the
dirty working tree (file contents included) matches. No network calls.
`;

function parseArgs(argv) {
  const out = { _: [], cwd: null, cmd: [], message: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--cwd") {
      if (argv[i + 1] == null) throw new UserError("missing value for --cwd");
      out.cwd = argv[++i];
    } else if (arg === "--cmd") {
      if (argv[i + 1] == null) throw new UserError("missing value for --cmd");
      out.cmd.push(argv[++i]);
    } else if (arg === "--message") {
      if (argv[i + 1] == null) throw new UserError("missing value for --message");
      out.message = argv[++i];
    } else if (arg.startsWith("-")) {
      throw new UserError("unknown option: " + arg);
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function printCheck(status, message) {
  const claims = message == null ? null : claimsTestsPassed(message);
  const allowClaim = claims == null ? null : !claims || status.fresh;
  return {
    fresh: status.fresh,
    reason: status.reason,
    detail: status.detail,
    claimsTestsPassed: claims,
    allowClaim,
    git: status.git,
    receiptPath: status.receiptPath,
    receipt: status.receipt,
  };
}

function formatDetect(found) {
  const lines = ["detection: " + found.source];
  if (found.commands.length === 0) {
    lines.push("would run: (none)");
    return lines.join("\n") + "\n";
  }
  for (const item of found.commands) {
    lines.push("");
    lines.push("would run: " + item.command);
    lines.push("source: " + item.source);
    lines.push("why: " + item.reason);
  }
  return lines.join("\n") + "\n";
}

function printHumanCheck(report) {
  const receipt = report.receipt;
  const lines = [
    "fresh: " + (report.fresh ? "yes" : "no"),
    "reason: " + report.reason,
    "detail: " + report.detail,
    "commit: " + (report.git && report.git.commit ? report.git.commit : "(none)"),
    "dirty: " + (report.git ? report.git.dirty : "(unknown)"),
    "receiptExitCode: " + (receipt ? receipt.exitCode : "(none)"),
    "command: " + (receipt && receipt.command ? receipt.command : "(none)"),
    "receipt: " + report.receiptPath,
  ];
  if (report.claimsTestsPassed != null) {
    lines.push("claimsTestsPassed: " + (report.claimsTestsPassed ? "yes" : "no"));
    lines.push("allowClaim: " + (report.allowClaim ? "yes" : "no"));
  }
  return lines.join("\n") + "\n";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || args._.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = args._[0];
  const cliPath = path.resolve(process.argv[1]);

  if (command === "print-hook") {
    const host = args._[1];
    if (host === "cursor") {
      process.stderr.write(
        "Cursor claim checking is not yet supported.\n" +
          "The documented stop input has status and loop_count only, not the assistant message " +
          "(https://cursor.com/docs/hooks). afterAgentResponse has the text, but no documented " +
          "block or follow-up output. Cursor can map a Claude Code decision=block to followup_message " +
          "(https://cursor.com/docs/reference/third-party-hooks), and this hook fail-opens when " +
          "last_assistant_message is missing. v1 does not parse transcripts.\n"
      );
      return 2;
    }
    if (!HOOK_FILES[host]) {
      throw new UserError("print-hook expects claude, codex, qoder, or cursor");
    }
    process.stderr.write(
      "Paste this into " +
        HOOK_FILES[host] +
        ". If that file already has hooks, merge the Stop entry instead of replacing the file.\n"
    );
    process.stdout.write(JSON.stringify(hookSettings(cliPath), null, 2) + "\n");
    return 0;
  }

  if (command === "hook") {
    const raw = (await readStdin()).trim();
    let input = {};
    if (raw) {
      try {
        input = JSON.parse(raw);
      } catch (err) {
        process.stderr.write("test-receipt: hook stdin is not JSON (" + err.message + "); allowing stop\n");
        process.stdout.write("{}\n");
        return 0;
      }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      process.stdout.write("{}\n");
      return 0;
    }
    const decision = decide(input, { cliPath });
    process.stdout.write(JSON.stringify(decision.output) + "\n");
    return 0;
  }

  const cwd = resolveCwd(args.cwd);

  if (command === "detect") {
    const found = detect(cwd);
    process.stdout.write(args.json ? JSON.stringify(found, null, 2) + "\n" : formatDetect(found));
    if (found.commands.length === 0) {
      process.stderr.write(
        "no test command detected. Add a real test script, or create .test-receipt.json with a commands array.\n"
      );
    }
    return 0;
  }

  if (command === "run") {
    const commands = args.cmd.length
      ? args.cmd.map((item) => ({ command: item, source: "cli" }))
      : detect(cwd).commands;
    if (commands.length === 0) {
      throw new UserError(
        "no test command detected. Pass --cmd, or create .test-receipt.json with a commands array."
      );
    }
    for (const item of commands) {
      process.stderr.write("running: " + item.command + "\n");
    }
    const result = await execute(cwd, commands);
    if (args.json) {
      process.stdout.write(JSON.stringify(result.receipt, null, 2) + "\n");
    } else {
      process.stdout.write(
        "exitCode: " +
          result.receipt.exitCode +
          "\nok: " +
          (result.receipt.ok ? "yes" : "no") +
          "\nreceipt: " +
          result.receiptPath +
          "\ncommit: " +
          (result.git.commit || "(none)") +
          "\ndirty: " +
          result.git.dirty +
          "\n"
      );
    }
    return result.receipt.exitCode === 0 ? 0 : result.receipt.exitCode;
  }

  if (command === "check") {
    const status = evaluate(cwd);
    const report = printCheck(status, args.message);
    process.stdout.write(args.json ? JSON.stringify(report, null, 2) + "\n" : printHumanCheck(report));
    if (args.message != null) return report.allowClaim ? 0 : 1;
    return report.fresh ? 0 : 1;
  }

  throw new UserError("unknown command: " + command);
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code || 0;
    })
    .catch((err) => {
      process.stderr.write((err && err.message ? err.message : String(err)) + "\n");
      process.exitCode = err && err.exitCode ? err.exitCode : 1;
    });
}

module.exports = { main, parseArgs, HELP };
