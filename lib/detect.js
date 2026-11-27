"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { UserError } = require("./errors");

const CONFIG_NAME = ".test-receipt.json";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new UserError("cannot read " + file + ": " + err.message);
  }
}

function isPlaceholderTestScript(script) {
  if (typeof script !== "string") return true;
  const text = script.trim();
  if (!text) return true;
  return /no test specified/i.test(text) && /exit\s+1/.test(text);
}

function packageRunner(cwd, pkg) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (
    fs.existsSync(path.join(cwd, "package-lock.json")) ||
    fs.existsSync(path.join(cwd, "npm-shrinkwrap.json"))
  ) {
    return "npm";
  }
  const field = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  if (field === "pnpm" || field.startsWith("pnpm@")) return "pnpm";
  if (field === "yarn" || field.startsWith("yarn@")) return "yarn";
  if (field === "npm" || field.startsWith("npm@")) return "npm";
  return "npm";
}

function fileIncludes(file, needle) {
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, "utf8").includes(needle);
}

function fileHasSection(file, section) {
  if (!fs.existsSync(file)) return false;
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .some((line) => line.trim() === section);
}

function dirHasPytestFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  let names;
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return names.some(
    (name) => name === "conftest.py" || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name)
  );
}

function looksLikePytest(cwd) {
  if (fs.existsSync(path.join(cwd, "pytest.ini"))) return true;
  if (fileIncludes(path.join(cwd, "pyproject.toml"), "[tool.pytest")) return true;
  if (fileHasSection(path.join(cwd, "setup.cfg"), "[tool:pytest]")) return true;
  if (fileHasSection(path.join(cwd, "setup.cfg"), "[pytest]")) return true;
  if (fileHasSection(path.join(cwd, "tox.ini"), "[pytest]")) return true;
  if (dirHasPytestFiles(cwd)) return true;
  if (dirHasPytestFiles(path.join(cwd, "tests"))) return true;
  if (dirHasPytestFiles(path.join(cwd, "test"))) return true;
  return false;
}

function makefileHasTest(cwd) {
  for (const name of ["Makefile", "makefile", "GNUmakefile"]) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (lines.some((line) => /^test\s*:/.test(line))) return true;
  }
  return false;
}

function commandsFromConfig(cwd) {
  const file = path.join(cwd, CONFIG_NAME);
  if (!fs.existsSync(file)) return null;
  const parsed = readJson(file);
  if (!parsed || !Array.isArray(parsed.commands) || parsed.commands.length === 0) {
    throw new UserError(CONFIG_NAME + ' must contain a non-empty "commands" array of strings');
  }
  return parsed.commands.map((command, index) => {
    if (typeof command !== "string" || !command.trim()) {
      throw new UserError(CONFIG_NAME + " commands[" + index + "] must be a non-empty string");
    }
    return { command: command.trim(), source: "config" };
  });
}

function detect(cwd) {
  const configured = commandsFromConfig(cwd);
  if (configured) return { source: "config", commands: configured };

  const commands = [];
  const pkg = readJson(path.join(cwd, "package.json"));
  if (pkg && pkg.scripts && !isPlaceholderTestScript(pkg.scripts.test)) {
    const runner = packageRunner(cwd, pkg);
    commands.push({ command: runner + " test", source: runner });
  }
  if (looksLikePytest(cwd)) commands.push({ command: "pytest", source: "pytest" });
  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    commands.push({ command: "go test ./...", source: "go" });
  }
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
    commands.push({ command: "cargo test", source: "cargo" });
  }
  if (makefileHasTest(cwd)) commands.push({ command: "make test", source: "make" });
  return { source: "detect", commands };
}

module.exports = {
  CONFIG_NAME,
  detect,
  isPlaceholderTestScript,
  looksLikePytest,
  makefileHasTest,
};
