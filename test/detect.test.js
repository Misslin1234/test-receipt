"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { detect, isPlaceholderTestScript } = require("../lib/detect");
const { tempDir, writeFile } = require("../support/helpers");

test("placeholder npm test script is ignored", () => {
  assert.equal(isPlaceholderTestScript('echo "Error: no test specified" && exit 1'), true);
  assert.equal(isPlaceholderTestScript("node --test"), false);
});

test("detects npm, pnpm, and yarn from lockfiles and packageManager", () => {
  const npmDir = tempDir();
  writeFile(npmDir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(npmDir, "package-lock.json", "{}\n");
  assert.deepEqual(detect(npmDir).commands, [
    {
      command: "npm test",
      source: "npm",
      reason: "package.json scripts.test and package-lock.json",
    },
  ]);

  const shrink = tempDir();
  writeFile(shrink, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(shrink, "npm-shrinkwrap.json", "{}\n");
  assert.deepEqual(detect(shrink).commands, [
    {
      command: "npm test",
      source: "npm",
      reason: "package.json scripts.test and npm-shrinkwrap.json",
    },
  ]);

  const pnpmDir = tempDir();
  writeFile(
    pnpmDir,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "npm@10.0.0" })
  );
  writeFile(pnpmDir, "pnpm-lock.yaml", "lockfileVersion: 9\n");
  assert.deepEqual(detect(pnpmDir).commands, [
    {
      command: "pnpm test",
      source: "pnpm",
      reason: "package.json scripts.test and pnpm-lock.yaml",
    },
  ]);

  const yarnDir = tempDir();
  writeFile(yarnDir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(yarnDir, "yarn.lock", "# yarn\n");
  assert.deepEqual(detect(yarnDir).commands, [
    {
      command: "yarn test",
      source: "yarn",
      reason: "package.json scripts.test and yarn.lock",
    },
  ]);

  const fieldDir = tempDir();
  writeFile(
    fieldDir,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "pnpm@9.0.0" })
  );
  assert.deepEqual(detect(fieldDir).commands, [
    {
      command: "pnpm test",
      source: "pnpm",
      reason: "package.json scripts.test and packageManager pnpm@9.0.0",
    },
  ]);

  const plain = tempDir();
  writeFile(plain, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  assert.deepEqual(detect(plain).commands, [
    { command: "npm test", source: "npm", reason: "package.json scripts.test" },
  ]);
});

test("skips the default npm test placeholder", () => {
  const dir = tempDir();
  writeFile(
    dir,
    "package.json",
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
  );
  assert.deepEqual(detect(dir).commands, []);
});

test("detects pytest, go, cargo, and make, and ignores a recipe named test", () => {
  const dir = tempDir();
  writeFile(dir, "pyproject.toml", "[tool.pytest.ini_options]\naddopts = -q\n");
  writeFile(dir, "go.mod", "module example.com/demo\n\ngo 1.22\n");
  writeFile(dir, "Cargo.toml", "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n");
  writeFile(dir, "Makefile", "all:\n\techo test:\n\ntest:\n\techo hi\n");
  assert.deepEqual(detect(dir).commands, [
    { command: "pytest", source: "pytest", reason: "pyproject.toml contains [tool.pytest" },
    { command: "go test ./...", source: "go", reason: "go.mod" },
    { command: "cargo test", source: "cargo", reason: "Cargo.toml" },
    { command: "make test", source: "make", reason: "Makefile has a test target" },
  ]);
});

test("a Makefile without a top-level test target is not make test", () => {
  const dir = tempDir();
  writeFile(dir, "Makefile", "all:\n\techo test:\n");
  assert.deepEqual(detect(dir).commands, []);
});

test("makefile and GNUmakefile test targets are make test", () => {
  const lower = tempDir();
  writeFile(lower, "makefile", "test:\n\techo hi\n");
  assert.deepEqual(detect(lower).commands, [
    { command: "make test", source: "make", reason: "makefile has a test target" },
  ]);

  const gnu = tempDir();
  writeFile(gnu, "GNUmakefile", "test:\n\techo hi\n");
  assert.deepEqual(detect(gnu).commands, [
    { command: "make test", source: "make", reason: "GNUmakefile has a test target" },
  ]);
});

test("pytest files are detected only when they look like tests", () => {
  const plain = tempDir();
  writeFile(plain, "app.py", "print('hi')\n");
  assert.deepEqual(detect(plain).commands, []);

  const tests = tempDir();
  writeFile(tests, "tests/test_add.py", "def test_add():\n    assert 1 + 1 == 2\n");
  assert.deepEqual(detect(tests).commands, [
    { command: "pytest", source: "pytest", reason: "pytest file tests/test_add.py" },
  ]);
});

test("config commands replace detection", () => {
  const dir = tempDir();
  writeFile(dir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(dir, "go.mod", "module example.com/demo\n\ngo 1.22\n");
  writeFile(
    dir,
    ".test-receipt.json",
    JSON.stringify({ commands: ["npm test -- --run", "pytest"] })
  );
  assert.deepEqual(detect(dir), {
    source: "config",
    commands: [
      { command: "npm test -- --run", source: "config", reason: ".test-receipt.json commands[0]" },
      { command: "pytest", source: "config", reason: ".test-receipt.json commands[1]" },
    ],
  });
});

test("a broken config file is an error", () => {
  const dir = tempDir();
  writeFile(dir, ".test-receipt.json", "{}\n");
  assert.throws(() => detect(dir), /commands/);
});

test("bun lockfiles select bun test, and a Node lockfile keeps the package script", () => {
  const binary = tempDir();
  writeFile(binary, "bun.lockb", "");
  assert.deepEqual(detect(binary).commands, [
    { command: "bun test", source: "bun", reason: "bun.lockb" },
  ]);

  const text = tempDir();
  writeFile(text, "bun.lock", "{}\n");
  assert.deepEqual(detect(text).commands, [
    { command: "bun test", source: "bun", reason: "bun.lock" },
  ]);

  const both = tempDir();
  writeFile(both, "bun.lockb", "");
  writeFile(both, "bun.lock", "{}\n");
  assert.deepEqual(detect(both).commands, [
    { command: "bun test", source: "bun", reason: "bun.lockb" },
  ]);

  const scriptOnly = tempDir();
  writeFile(
    scriptOnly,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "npm@10.0.0" })
  );
  writeFile(scriptOnly, "bun.lock", "{}\n");
  assert.deepEqual(detect(scriptOnly).commands, [
    { command: "bun test", source: "bun", reason: "bun.lock" },
  ]);

  const placeholder = tempDir();
  writeFile(
    placeholder,
    "package.json",
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
  );
  writeFile(placeholder, "bun.lockb", "");
  assert.deepEqual(detect(placeholder).commands, [
    { command: "bun test", source: "bun", reason: "bun.lockb" },
  ]);

  const notAFile = tempDir();
  writeFile(notAFile, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  fs.mkdirSync(path.join(notAFile, "bun.lock"));
  assert.deepEqual(detect(notAFile).commands, [
    { command: "npm test", source: "npm", reason: "package.json scripts.test" },
  ]);

  const packageManagerBun = tempDir();
  writeFile(
    packageManagerBun,
    "package.json",
    JSON.stringify({ scripts: { test: "node --test" }, packageManager: "bun@1.1.0" })
  );
  assert.deepEqual(detect(packageManagerBun).commands, [
    { command: "npm test", source: "npm", reason: "package.json scripts.test" },
  ]);

  function keeps(lockName, command, source, via) {
    const dir = tempDir();
    writeFile(dir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
    writeFile(dir, lockName, "{}\n");
    writeFile(dir, "bun.lockb", "");
    writeFile(dir, "bun.lock", "{}\n");
    assert.deepEqual(detect(dir).commands, [
      { command, source, reason: "package.json scripts.test and " + via },
    ]);
  }

  keeps("pnpm-lock.yaml", "pnpm test", "pnpm", "pnpm-lock.yaml");
  keeps("yarn.lock", "yarn test", "yarn", "yarn.lock");
  keeps("package-lock.json", "npm test", "npm", "package-lock.json");
  keeps("npm-shrinkwrap.json", "npm test", "npm", "npm-shrinkwrap.json");

  const lockWithoutScript = tempDir();
  writeFile(lockWithoutScript, "yarn.lock", "# yarn\n");
  writeFile(lockWithoutScript, "bun.lock", "{}\n");
  assert.deepEqual(detect(lockWithoutScript).commands, [
    { command: "bun test", source: "bun", reason: "bun.lock" },
  ]);
});

test("deno.json and deno.jsonc select deno test once", () => {
  const json = tempDir();
  writeFile(json, "deno.json", "{}\n");
  assert.deepEqual(detect(json).commands, [
    { command: "deno test", source: "deno", reason: "deno.json" },
  ]);

  const jsonc = tempDir();
  writeFile(jsonc, "deno.jsonc", "{}\n");
  assert.deepEqual(detect(jsonc).commands, [
    { command: "deno test", source: "deno", reason: "deno.jsonc" },
  ]);

  const both = tempDir();
  writeFile(both, "deno.json", "{}\n");
  writeFile(both, "deno.jsonc", "{}\n");
  assert.deepEqual(detect(both).commands, [
    { command: "deno test", source: "deno", reason: "deno.json" },
  ]);
});

test("maven uses mvn test and prefers a mvnw file", () => {
  const plain = tempDir();
  writeFile(plain, "pom.xml", "<project></project>\n");
  assert.deepEqual(detect(plain).commands, [
    { command: "mvn test", source: "maven", reason: "pom.xml" },
  ]);

  const wrapped = tempDir();
  writeFile(wrapped, "pom.xml", "<project></project>\n");
  writeFile(wrapped, "mvnw", "#!/bin/sh\n");
  assert.deepEqual(detect(wrapped).commands, [
    { command: "./mvnw test", source: "maven", reason: "pom.xml and mvnw" },
  ]);

  const windows = tempDir();
  writeFile(windows, "pom.xml", "<project></project>\n");
  writeFile(windows, "mvnw.cmd", "@echo off\n");
  assert.deepEqual(detect(windows).commands, [
    { command: "mvn test", source: "maven", reason: "pom.xml" },
  ]);

  const directory = tempDir();
  writeFile(directory, "pom.xml", "<project></project>\n");
  fs.mkdirSync(path.join(directory, "mvnw"));
  assert.deepEqual(detect(directory).commands, [
    { command: "mvn test", source: "maven", reason: "pom.xml" },
  ]);

  const wrapperOnly = tempDir();
  writeFile(wrapperOnly, "mvnw", "#!/bin/sh\n");
  assert.deepEqual(detect(wrapperOnly).commands, []);
});

test("gradle uses gradle test and prefers a gradlew file", () => {
  const groovy = tempDir();
  writeFile(groovy, "build.gradle", "\n");
  assert.deepEqual(detect(groovy).commands, [
    { command: "gradle test", source: "gradle", reason: "build.gradle" },
  ]);

  const kotlin = tempDir();
  writeFile(kotlin, "build.gradle.kts", "\n");
  assert.deepEqual(detect(kotlin).commands, [
    { command: "gradle test", source: "gradle", reason: "build.gradle.kts" },
  ]);

  const wrapped = tempDir();
  writeFile(wrapped, "build.gradle.kts", "\n");
  writeFile(wrapped, "gradlew", "#!/bin/sh\n");
  assert.deepEqual(detect(wrapped).commands, [
    { command: "./gradlew test", source: "gradle", reason: "build.gradle.kts and gradlew" },
  ]);

  const both = tempDir();
  writeFile(both, "build.gradle", "\n");
  writeFile(both, "build.gradle.kts", "\n");
  writeFile(both, "gradlew", "#!/bin/sh\n");
  assert.deepEqual(detect(both).commands, [
    { command: "./gradlew test", source: "gradle", reason: "build.gradle and gradlew" },
  ]);

  const bat = tempDir();
  writeFile(bat, "build.gradle", "\n");
  writeFile(bat, "gradlew.bat", "@echo off\n");
  assert.deepEqual(detect(bat).commands, [
    { command: "gradle test", source: "gradle", reason: "build.gradle" },
  ]);

  const directory = tempDir();
  writeFile(directory, "build.gradle", "\n");
  fs.mkdirSync(path.join(directory, "gradlew"));
  assert.deepEqual(detect(directory).commands, [
    { command: "gradle test", source: "gradle", reason: "build.gradle" },
  ]);

  const wrapperOnly = tempDir();
  writeFile(wrapperOnly, "gradlew", "#!/bin/sh\n");
  assert.deepEqual(detect(wrapperOnly).commands, []);
});

test("dotnet test comes from a root sln or csproj", () => {
  const sln = tempDir();
  writeFile(sln, "App.SLN", "\n");
  assert.deepEqual(detect(sln).commands, [
    { command: "dotnet test", source: "dotnet", reason: "App.SLN" },
  ]);

  const project = tempDir();
  writeFile(project, "Demo.csproj", "<Project></Project>\n");
  assert.deepEqual(detect(project).commands, [
    { command: "dotnet test", source: "dotnet", reason: "Demo.csproj" },
  ]);

  const both = tempDir();
  writeFile(both, "a.csproj", "<Project></Project>\n");
  writeFile(both, "z.sln", "\n");
  assert.deepEqual(detect(both).commands, [
    { command: "dotnet test", source: "dotnet", reason: "z.sln" },
  ]);

  const many = tempDir();
  writeFile(many, "zeta.csproj", "<Project></Project>\n");
  writeFile(many, "alpha.csproj", "<Project></Project>\n");
  assert.deepEqual(detect(many).commands, [
    { command: "dotnet test", source: "dotnet", reason: "alpha.csproj" },
  ]);

  const notProject = tempDir();
  writeFile(notProject, "notes.sln.txt", "\n");
  fs.mkdirSync(path.join(notProject, "missing.csproj"));
  assert.deepEqual(detect(notProject).commands, []);
});

test("ruby needs a Gemfile plus spec/ or Rakefile", () => {
  const rspec = tempDir();
  writeFile(rspec, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(rspec, "spec/example_spec.rb", "\n");
  assert.deepEqual(detect(rspec).commands, [
    { command: "bundle exec rspec", source: "rspec", reason: "Gemfile and spec/" },
  ]);

  const rake = tempDir();
  writeFile(rake, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(rake, "Rakefile", "task :test\n");
  assert.deepEqual(detect(rake).commands, [
    { command: "bundle exec rake test", source: "rake", reason: "Gemfile and Rakefile" },
  ]);

  const both = tempDir();
  writeFile(both, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(both, "spec/example_spec.rb", "\n");
  writeFile(both, "Rakefile", "task :test\n");
  assert.deepEqual(detect(both).commands, [
    { command: "bundle exec rspec", source: "rspec", reason: "Gemfile and spec/" },
    { command: "bundle exec rake test", source: "rake", reason: "Gemfile and Rakefile" },
  ]);

  const gemfileOnly = tempDir();
  writeFile(gemfileOnly, "Gemfile", "source 'https://rubygems.org'\n");
  assert.deepEqual(detect(gemfileOnly).commands, []);

  const specOnly = tempDir();
  writeFile(specOnly, "spec/example_spec.rb", "\n");
  assert.deepEqual(detect(specOnly).commands, []);

  const rakeOnly = tempDir();
  writeFile(rakeOnly, "Rakefile", "task :test\n");
  assert.deepEqual(detect(rakeOnly).commands, []);

  const lower = tempDir();
  writeFile(lower, "gemfile", "source 'https://rubygems.org'\n");
  writeFile(lower, "spec/example_spec.rb", "\n");
  assert.deepEqual(detect(lower).commands, []);

  const specFile = tempDir();
  writeFile(specFile, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(specFile, "spec", "not a directory\n");
  assert.deepEqual(detect(specFile).commands, []);
});

test("phpunit.xml and phpunit.xml.dist select vendor/bin/phpunit", () => {
  const xml = tempDir();
  writeFile(xml, "phpunit.xml", "<phpunit/>\n");
  assert.deepEqual(detect(xml).commands, [
    { command: "vendor/bin/phpunit", source: "phpunit", reason: "phpunit.xml" },
  ]);

  const dist = tempDir();
  writeFile(dist, "phpunit.xml.dist", "<phpunit/>\n");
  assert.deepEqual(detect(dist).commands, [
    { command: "vendor/bin/phpunit", source: "phpunit", reason: "phpunit.xml.dist" },
  ]);

  const both = tempDir();
  writeFile(both, "phpunit.xml", "<phpunit/>\n");
  writeFile(both, "phpunit.xml.dist", "<phpunit/>\n");
  assert.deepEqual(detect(both).commands, [
    { command: "vendor/bin/phpunit", source: "phpunit", reason: "phpunit.xml" },
  ]);
});

test("marker files in subdirectories are ignored", () => {
  const dir = tempDir();
  writeFile(dir, "nested/pom.xml", "<project></project>\n");
  writeFile(dir, "nested/build.gradle", "\n");
  writeFile(dir, "nested/deno.json", "{}\n");
  writeFile(dir, "nested/bun.lock", "{}\n");
  writeFile(dir, "nested/phpunit.xml", "<phpunit/>\n");
  writeFile(dir, "nested/Gemfile", "source 'https://rubygems.org'\n");
  writeFile(dir, "nested/spec/example_spec.rb", "\n");
  writeFile(dir, "nested/Rakefile", "task :test\n");
  writeFile(dir, "nested/App.csproj", "<Project></Project>\n");
  writeFile(dir, "src/App.sln", "\n");
  assert.deepEqual(detect(dir).commands, []);
});

test("detected commands stay in the documented order", () => {
  const dir = tempDir();
  writeFile(dir, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(dir, "package-lock.json", "{}\n");
  writeFile(dir, "bun.lock", "{}\n");
  writeFile(dir, "deno.json", "{}\n");
  writeFile(dir, "pytest.ini", "[pytest]\n");
  writeFile(dir, "go.mod", "module example.com/demo\n\ngo 1.22\n");
  writeFile(dir, "Cargo.toml", "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n");
  writeFile(dir, "Makefile", "test:\n\techo hi\n");
  writeFile(dir, "pom.xml", "<project></project>\n");
  writeFile(dir, "build.gradle", "\n");
  writeFile(dir, "app.csproj", "<Project></Project>\n");
  writeFile(dir, "Gemfile", "source 'https://rubygems.org'\n");
  writeFile(dir, "spec/example_spec.rb", "\n");
  writeFile(dir, "Rakefile", "task :test\n");
  writeFile(dir, "phpunit.xml", "<phpunit/>\n");
  assert.deepEqual(detect(dir).commands, [
    {
      command: "npm test",
      source: "npm",
      reason: "package.json scripts.test and package-lock.json",
    },
    { command: "deno test", source: "deno", reason: "deno.json" },
    { command: "pytest", source: "pytest", reason: "pytest.ini" },
    { command: "go test ./...", source: "go", reason: "go.mod" },
    { command: "cargo test", source: "cargo", reason: "Cargo.toml" },
    { command: "make test", source: "make", reason: "Makefile has a test target" },
    { command: "mvn test", source: "maven", reason: "pom.xml" },
    { command: "gradle test", source: "gradle", reason: "build.gradle" },
    { command: "dotnet test", source: "dotnet", reason: "app.csproj" },
    { command: "bundle exec rspec", source: "rspec", reason: "Gemfile and spec/" },
    { command: "bundle exec rake test", source: "rake", reason: "Gemfile and Rakefile" },
    { command: "vendor/bin/phpunit", source: "phpunit", reason: "phpunit.xml" },
  ]);

  const bunFirst = tempDir();
  writeFile(bunFirst, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  writeFile(bunFirst, "bun.lockb", "");
  writeFile(bunFirst, "deno.json", "{}\n");
  assert.deepEqual(detect(bunFirst).commands, [
    { command: "bun test", source: "bun", reason: "bun.lockb" },
    { command: "deno test", source: "deno", reason: "deno.json" },
  ]);
});
