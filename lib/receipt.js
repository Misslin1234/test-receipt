"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SCHEMA_VERSION, receiptPath } = require("./constants");
const { gitState, runGit } = require("./git");

const DETAILS = {
  "no-receipt": "No .test-receipt/latest.json file exists yet.",
  "bad-receipt": "The receipt file is missing required fields or is not valid JSON.",
  "not-a-git-repo":
    "A passing claim needs a git repository so the receipt can be tied to a commit and working tree.",
  "git-error": "git status failed, so the working tree could not be checked.",
  "commit-mismatch": "The receipt was written for a different commit.",
  "dirty-mismatch": "The working tree became clean or dirty after the receipt was written.",
  "fingerprint-mismatch": "File contents changed after the receipt was written.",
  "exit-nonzero": "The test command did not exit 0.",
  fresh: "A passing receipt matches this commit and working tree.",
};

function writeReceipt(cwd, receipt) {
  const dest = receiptPath(cwd);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  fs.renameSync(tmp, dest);
  return dest;
}

function receiptCwd(cwd) {
  const start = path.resolve(cwd);
  const top = runGit(start, ["rev-parse", "--show-toplevel"]);
  const stop = top.status === 0 && top.stdout.trim() ? path.resolve(top.stdout.trim()) : start;
  let dir = start;
  while (true) {
    if (fs.existsSync(receiptPath(dir))) return dir;
    if (dir === stop) return start;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function readReceipt(cwd) {
  const dest = receiptPath(cwd);
  let raw;
  try {
    raw = fs.readFileSync(dest, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { missing: true, path: dest };
    return { invalid: true, path: dest, error: err.message };
  }
  try {
    const receipt = JSON.parse(raw);
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return { invalid: true, path: dest, error: "receipt is not an object" };
    }
    return { missing: false, invalid: false, path: dest, receipt };
  } catch (err) {
    return { invalid: true, path: dest, error: err.message };
  }
}

function receiptUsable(receipt) {
  if (!receipt || receipt.schemaVersion !== SCHEMA_VERSION) return false;
  if (!receipt.git || typeof receipt.git !== "object") return false;
  if (typeof receipt.ok !== "boolean") return false;
  if (typeof receipt.exitCode !== "number") return false;
  if (typeof receipt.command !== "string") return false;
  return true;
}

function evaluate(cwd) {
  const git = gitState(cwd);
  const loaded = readReceipt(receiptCwd(cwd));
  const base = { git, receiptPath: loaded.path, receipt: loaded.receipt || null };

  if (loaded.missing) {
    return { fresh: false, reason: "no-receipt", detail: DETAILS["no-receipt"], ...base, receipt: null };
  }
  if (loaded.invalid || !receiptUsable(loaded.receipt)) {
    return {
      fresh: false,
      reason: "bad-receipt",
      detail: DETAILS["bad-receipt"] + (loaded.error ? " " + loaded.error : ""),
      ...base,
    };
  }

  const receipt = loaded.receipt;
  if (!git.inGit) {
    const detail = git.gitMissing
      ? DETAILS["not-a-git-repo"] + " git was not found on PATH."
      : DETAILS["not-a-git-repo"];
    return { fresh: false, reason: "not-a-git-repo", detail, ...base, receipt };
  }
  if (!git.treeFingerprint) {
    return {
      fresh: false,
      reason: "git-error",
      detail: DETAILS["git-error"] + (git.error ? " " + git.error : ""),
      ...base,
      receipt,
    };
  }
  if (receipt.git.commit !== git.commit) {
    return { fresh: false, reason: "commit-mismatch", detail: DETAILS["commit-mismatch"], ...base, receipt };
  }
  if (receipt.git.dirty !== git.dirty) {
    return { fresh: false, reason: "dirty-mismatch", detail: DETAILS["dirty-mismatch"], ...base, receipt };
  }
  if (receipt.git.treeFingerprint !== git.treeFingerprint) {
    return {
      fresh: false,
      reason: "fingerprint-mismatch",
      detail: DETAILS["fingerprint-mismatch"],
      ...base,
      receipt,
    };
  }
  if (receipt.ok !== true || receipt.exitCode !== 0) {
    return {
      fresh: false,
      reason: "exit-nonzero",
      detail: DETAILS["exit-nonzero"] + " Exit code was " + receipt.exitCode + ".",
      ...base,
      receipt,
    };
  }
  return { fresh: true, reason: "fresh", detail: DETAILS.fresh, ...base, receipt };
}

module.exports = {
  DETAILS,
  writeReceipt,
  readReceipt,
  evaluate,
  receiptUsable,
};
