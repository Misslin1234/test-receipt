"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("SKILL.md matches the Agent Skills spec shape", () => {
  const skillDir = path.join(__dirname, "..", "skills", "test-receipt");
  const text = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  assert.equal(path.basename(skillDir), "test-receipt");
  assert.ok(text.startsWith("---\n"));
  const end = text.indexOf("\n---\n", 4);
  assert.ok(end > 0);
  const frontmatter = text.slice(4, end);
  assert.match(frontmatter, /^name: test-receipt$/m);
  const description = frontmatter.match(/^description: "(.*)"$/m);
  assert.ok(description, "description must be a quoted one-line string");
  assert.ok(description[1].length >= 50 && description[1].length <= 1024);
  assert.ok(description[1].length <= 300);
  const body = text.slice(end + 5);
  assert.ok(body.split(/\r?\n/).length < 500);
  assert.match(body, /test-receipt run/);
  assert.match(body, /测试通过/);
  assert.match(body, /by hand/);
});
