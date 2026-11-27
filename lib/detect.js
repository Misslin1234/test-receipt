"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { UserError } = require("./errors");

const CONFIG_NAME = ".test-receipt.json";

// Fixed order. Every match is kept, except JavaScript vs Bun (one command)
// and except `.test-receipt.json`, which replaces this list:
//   1. npm/pnpm/yarn test, or bun test
//   2. deno test
//   3. pytest
//   4. go test ./...
//   5. cargo test
//   6. make test
//   7. Maven (./mvnw test or mvn test)
//   8. Gradle (./gradlew test or gradle test)
//   9. dotnet test
//  10. bundle exec rspec
//  11. bundle exec rake test
//  12. vendor/bin/phpunit
//
// A Bun lockfile selects `bun test` instead of the package.json script
// unless an npm, pnpm, or yarn lockfile is also present. Then the package
// script wins and `bun test` is not added. `packageManager` alone does not
// beat a Bun lockfile. `packageManager: bun` without a Bun lockfile stays
// `npm test`. With no Bun lockfile, package.json detection matches 0.1.0.

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new UserError("cannot read " + file + ": " + err.message);
  }
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDir(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function isPlaceholderTestScript(script) {
  if (typeof script !== "string") return true;
  const text = script.trim();
  if (!text) return true;
  return /no test specified/i.test(text) && /exit\s+1/.test(text);
}

function packageRunnerInfo(cwd, pkg) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return { runner: "pnpm", via: "pnpm-lock.yaml" };
  }
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return { runner: "yarn", via: "yarn.lock" };
  }
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    return { runner: "npm", via: "package-lock.json" };
  }
  if (fs.existsSync(path.join(cwd, "npm-shrinkwrap.json"))) {
    return { runner: "npm", via: "npm-shrinkwrap.json" };
  }
  const field = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  if (field === "pnpm" || field.startsWith("pnpm@")) {
    return { runner: "pnpm", via: "packageManager " + field };
  }
  if (field === "yarn" || field.startsWith("yarn@")) {
    return { runner: "yarn", via: "packageManager " + field };
  }
  if (field === "npm" || field.startsWith("npm@")) {
    return { runner: "npm", via: "packageManager " + field };
  }
  return { runner: "npm", via: null };
}

function hasNodePackageLock(cwd) {
  return (
    fs.existsSync(path.join(cwd, "pnpm-lock.yaml")) ||
    fs.existsSync(path.join(cwd, "yarn.lock")) ||
    fs.existsSync(path.join(cwd, "package-lock.json")) ||
    fs.existsSync(path.join(cwd, "npm-shrinkwrap.json"))
  );
}

function nodePackageCommand(cwd, pkg) {
  if (!pkg || !pkg.scripts || isPlaceholderTestScript(pkg.scripts.test)) return null;
  const info = packageRunnerInfo(cwd, pkg);
  const reason = info.via
    ? "package.json scripts.test and " + info.via
    : "package.json scripts.test";
  return { command: info.runner + " test", source: info.runner, reason };
}

function bunCommand(cwd) {
  if (isFile(path.join(cwd, "bun.lockb"))) {
    return { command: "bun test", source: "bun", reason: "bun.lockb" };
  }
  if (isFile(path.join(cwd, "bun.lock"))) {
    return { command: "bun test", source: "bun", reason: "bun.lock" };
  }
  return null;
}

function javascriptCommand(cwd) {
  const pkg = readJson(path.join(cwd, "package.json"));
  const nodeCmd = nodePackageCommand(cwd, pkg);
  const bunCmd = bunCommand(cwd);
  if (bunCmd && !(nodeCmd && hasNodePackageLock(cwd))) return bunCmd;
  return nodeCmd;
}

function denoCommand(cwd) {
  if (isFile(path.join(cwd, "deno.json"))) {
    return { command: "deno test", source: "deno", reason: "deno.json" };
  }
  if (isFile(path.join(cwd, "deno.jsonc"))) {
    return { command: "deno test", source: "deno", reason: "deno.jsonc" };
  }
  return null;
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

function matchingPytestFile(dir) {
  if (!fs.existsSync(dir)) return null;
  let names;
  try {
    if (!fs.statSync(dir).isDirectory()) return null;
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const matches = names.filter(
    (name) => name === "conftest.py" || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name)
  );
  matches.sort();
  return matches[0] || null;
}

function dirHasPytestFiles(dir) {
  return matchingPytestFile(dir) != null;
}

function pytestReason(cwd) {
  if (fs.existsSync(path.join(cwd, "pytest.ini"))) return "pytest.ini";
  if (fileIncludes(path.join(cwd, "pyproject.toml"), "[tool.pytest")) {
    return "pyproject.toml contains [tool.pytest";
  }
  if (fileHasSection(path.join(cwd, "setup.cfg"), "[tool:pytest]")) {
    return "setup.cfg has [tool:pytest]";
  }
  if (fileHasSection(path.join(cwd, "setup.cfg"), "[pytest]")) return "setup.cfg has [pytest]";
  if (fileHasSection(path.join(cwd, "tox.ini"), "[pytest]")) return "tox.ini has [pytest]";
  const inRoot = matchingPytestFile(cwd);
  if (inRoot) return "pytest file " + inRoot;
  const inTests = matchingPytestFile(path.join(cwd, "tests"));
  if (inTests) return "pytest file tests/" + inTests;
  const inTest = matchingPytestFile(path.join(cwd, "test"));
  if (inTest) return "pytest file test/" + inTest;
  return null;
}

function looksLikePytest(cwd) {
  return pytestReason(cwd) != null;
}

function makefileCommand(cwd) {
  for (const name of ["Makefile", "makefile", "GNUmakefile"]) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (lines.some((line) => /^test\s*:/.test(line))) {
      return { command: "make test", source: "make", reason: name + " has a test target" };
    }
  }
  return null;
}

function makefileHasTest(cwd) {
  return makefileCommand(cwd) != null;
}

function mavenCommand(cwd) {
  if (!isFile(path.join(cwd, "pom.xml"))) return null;
  if (isFile(path.join(cwd, "mvnw"))) {
    return { command: "./mvnw test", source: "maven", reason: "pom.xml and mvnw" };
  }
  return { command: "mvn test", source: "maven", reason: "pom.xml" };
}

function gradleCommand(cwd) {
  const groovy = isFile(path.join(cwd, "build.gradle"));
  const kotlin = isFile(path.join(cwd, "build.gradle.kts"));
  if (!groovy && !kotlin) return null;
  const buildFile = groovy ? "build.gradle" : "build.gradle.kts";
  if (isFile(path.join(cwd, "gradlew"))) {
    return { command: "./gradlew test", source: "gradle", reason: buildFile + " and gradlew" };
  }
  return { command: "gradle test", source: "gradle", reason: buildFile };
}

function dotnetCommand(cwd) {
  let names;
  try {
    names = fs.readdirSync(cwd);
  } catch {
    return null;
  }
  const slns = [];
  const projects = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const isSln = lower.endsWith(".sln");
    const isCsproj = lower.endsWith(".csproj");
    if (!isSln && !isCsproj) continue;
    if (!isFile(path.join(cwd, name))) continue;
    if (isSln) slns.push(name);
    else projects.push(name);
  }
  slns.sort();
  projects.sort();
  if (slns.length > 0) return { command: "dotnet test", source: "dotnet", reason: slns[0] };
  if (projects.length > 0) {
    return { command: "dotnet test", source: "dotnet", reason: projects[0] };
  }
  return null;
}

function rubyCommands(cwd) {
  if (!isFile(path.join(cwd, "Gemfile"))) return [];
  const commands = [];
  if (isDir(path.join(cwd, "spec"))) {
    commands.push({
      command: "bundle exec rspec",
      source: "rspec",
      reason: "Gemfile and spec/",
    });
  }
  if (isFile(path.join(cwd, "Rakefile"))) {
    commands.push({
      command: "bundle exec rake test",
      source: "rake",
      reason: "Gemfile and Rakefile",
    });
  }
  return commands;
}

function phpunitCommand(cwd) {
  if (isFile(path.join(cwd, "phpunit.xml"))) {
    return { command: "vendor/bin/phpunit", source: "phpunit", reason: "phpunit.xml" };
  }
  if (isFile(path.join(cwd, "phpunit.xml.dist"))) {
    return {
      command: "vendor/bin/phpunit",
      source: "phpunit",
      reason: "phpunit.xml.dist",
    };
  }
  return null;
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
    return {
      command: command.trim(),
      source: "config",
      reason: CONFIG_NAME + " commands[" + index + "]",
    };
  });
}

function pushIf(commands, item) {
  if (item) commands.push(item);
}

function detect(cwd) {
  const configured = commandsFromConfig(cwd);
  if (configured) return { source: "config", commands: configured };

  const commands = [];
  pushIf(commands, javascriptCommand(cwd));
  pushIf(commands, denoCommand(cwd));
  const pytest = pytestReason(cwd);
  if (pytest) commands.push({ command: "pytest", source: "pytest", reason: pytest });
  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    commands.push({ command: "go test ./...", source: "go", reason: "go.mod" });
  }
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
    commands.push({ command: "cargo test", source: "cargo", reason: "Cargo.toml" });
  }
  pushIf(commands, makefileCommand(cwd));
  pushIf(commands, mavenCommand(cwd));
  pushIf(commands, gradleCommand(cwd));
  pushIf(commands, dotnetCommand(cwd));
  for (const item of rubyCommands(cwd)) commands.push(item);
  pushIf(commands, phpunitCommand(cwd));
  return { source: "detect", commands };
}

module.exports = {
  CONFIG_NAME,
  detect,
  isPlaceholderTestScript,
  looksLikePytest,
  makefileHasTest,
};
