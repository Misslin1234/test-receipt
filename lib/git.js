"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { RECEIPT_DIR } = require("./constants");

function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
}

function runGit(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function isReceiptPath(filePath) {
  const norm = String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
  return norm === RECEIPT_DIR || norm.startsWith(RECEIPT_DIR + "/");
}

// git status --porcelain -z uses XY<space>PATH\0, and a rename adds PATH\0DEST\0.
function parsePorcelainZ(text) {
  if (!text) return [];
  const parts = String(text).split("\0");
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.length < 4) continue;
    const xy = part.slice(0, 2);
    const pathPart = part.slice(3);
    const renamed = xy[0] === "R" || xy[0] === "C" || xy[1] === "R" || xy[1] === "C";
    if (renamed) {
      const dest = parts[i + 1] || "";
      i += 1;
      if (dest) entries.push({ xy, path: dest, from: pathPart });
    } else if (pathPart) {
      entries.push({ xy, path: pathPart });
    }
  }
  return entries;
}

function insideCwd(cwd, rel) {
  const root = path.resolve(cwd);
  const abs = path.resolve(root, rel);
  if (abs === root) return null;
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!abs.startsWith(prefix)) return null;
  return abs;
}

function hashFile(hash, abs) {
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) {
      hash.update("SYMLINK:");
      hash.update(fs.readlinkSync(abs));
      return;
    }
    if (st.isFile()) {
      hash.update(fs.readFileSync(abs));
      return;
    }
    hash.update("NOT_FILE");
  } catch (err) {
    hash.update("UNREADABLE:" + (err.code || "ERR"));
  }
}

function emptyGit(extra) {
  return {
    inGit: false,
    gitMissing: false,
    commit: null,
    dirty: null,
    treeFingerprint: null,
    ...extra,
  };
}

function gitState(cwd) {
  const probe = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (probe.error && probe.error.code === "ENOENT") {
    return emptyGit({ gitMissing: true });
  }
  if (probe.status !== 0 || String(probe.stdout || "").trim() !== "true") {
    return emptyGit();
  }

  const head = runGit(cwd, ["rev-parse", "HEAD"]);
  const commit = head.status === 0 ? head.stdout.trim() : null;
  const status = runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  if (status.status !== 0) {
    return {
      inGit: true,
      gitMissing: false,
      commit,
      dirty: null,
      treeFingerprint: null,
      error: (status.stderr || "git status failed").trim(),
    };
  }

  const entries = parsePorcelainZ(status.stdout)
    .filter((entry) => entry.path && !isReceiptPath(entry.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const hash = crypto.createHash("sha256");
  hash.update(commit == null ? "NO_COMMIT" : commit);
  hash.update("\n");
  for (const entry of entries) {
    hash.update(entry.xy + " " + entry.path);
    hash.update("\n");
    const abs = insideCwd(cwd, entry.path);
    if (!abs) {
      hash.update("OUTSIDE\n");
      continue;
    }
    hash.update(entry.path);
    hash.update("\0");
    hashFile(hash, abs);
    hash.update("\n");
  }

  return {
    inGit: true,
    gitMissing: false,
    commit,
    dirty: entries.length > 0,
    treeFingerprint: "sha256:" + hash.digest("hex"),
  };
}

function receiptIgnored(cwd) {
  const check = runGit(cwd, ["check-ignore", "-q", RECEIPT_DIR + "/latest.json"]);
  return check.status === 0;
}

function ensureGitignore(cwd) {
  const state = gitState(cwd);
  if (!state.inGit) return { changed: false, git: state };
  if (receiptIgnored(cwd)) return { changed: false, git: state };

  const file = path.join(cwd, ".gitignore");
  let text = "";
  if (fs.existsSync(file)) text = fs.readFileSync(file, "utf8");
  const already = text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed === ".test-receipt/" || trimmed === ".test-receipt";
  });
  if (already) return { changed: false, git: state };

  const block = "# Local test receipts. Do not commit.\n.test-receipt/\n";
  const prefix = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(file, text.length === 0 ? block : prefix + "\n" + block);
  return { changed: true, git: gitState(cwd) };
}

module.exports = {
  gitState,
  ensureGitignore,
  parsePorcelainZ,
  isReceiptPath,
  runGit,
};
