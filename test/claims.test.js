"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { claimsTestsPassed } = require("../lib/claims");

const claims = [
  "All tests pass.",
  "Tests passed.",
  "The tests are passing.",
  "All 12 tests passed.",
  "the unit tests have passed",
  "npm test passed.",
  "pytest passed.",
  "I ran the tests and they passed.",
  "The test suite passed.",
  "No tests failed.",
  "All tests pass, but the docs were not updated.",
  "测试通过。",
  "全部测试已通过。",
  "单元测试通过。",
  "测试都过了。",
  "测试成功。",
  "已通过测试。",
  "测试没有失败。",
];

const notClaims = [
  "",
  "I updated the README.",
  "Tests were not run.",
  "I did not run the tests.",
  "Tests failed.",
  "The tests don't pass.",
  "Tests did not pass.",
  "Please run the tests.",
  "I'll run tests next.",
  "Tests should pass once you start the database.",
  "Do not say tests passed.",
  "If tests pass, ship it.",
  "测试失败。",
  "测试未通过。",
  "测试不成功。",
  "没有运行测试。",
  "未通过测试。",
];

test("pass claims are recognized in English and Chinese", () => {
  for (const text of claims) {
    assert.equal(claimsTestsPassed(text), true, text);
  }
});

test("failures, refusals, and unrelated text are not pass claims", () => {
  for (const text of notClaims) {
    assert.equal(claimsTestsPassed(text), false, JSON.stringify(text));
  }
});

test("a sentence with a pass word and a test word is a claim unless it is negated", () => {
  const rows = [
    ["I ran the tests and everything passes.", true],
    ["Tests: 12 passed, 0 failed.", true],
    ["pytest: 14 passed.", true],
    ["Ran 5 tests, all passed.", true],
    ["测试已经通过", true],
    ["测试全绿", true],
    ["All checks are green.", true],
    ["cargo test passes.", true],
    ["The test suite passes.", true],
    ["I couldn't confirm that the tests pass.", false],
    ["I haven't verified that the tests pass.", false],
    ["Not all tests pass.", false],
    ["No tests passed.", false],
    ["Tests failed with exit code 1.", false],
  ];
  const misses = [];
  for (const [text, expected] of rows) {
    const got = claimsTestsPassed(text);
    if (got !== expected) misses.push(JSON.stringify(text) + " => " + got);
  }
  assert.deepEqual(misses, []);
});
