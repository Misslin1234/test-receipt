"use strict";

const PASS_WORD = [
  /\bpass(?:es|ed|ing)?\b/i,
  /\bgreen\b/i,
  /\bsucceed\w*/i,
  /\ball\s+passed\b/i,
  /通过/,
  /全绿/,
  /成功/,
  /过了/,
];

const TEST_WORD = [
  /\btests?\b/i,
  /\bsuite\b/i,
  /\bpytest\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
  /\bchecks\b/i,
  /测试/,
  /用例/,
];

const DISQUALIFY = [
  /\bnot\b/i,
  /\bno\b/i,
  /\bcannot\b/i,
  /\bunable\b/i,
  /\b(?:could|can|have|did|do|does|is|are|was|were|will|would|should)(?:\s+not|n['’]t)\b/i,
  /\bfail(?:ed|ing|s|ure)?\b/i,
  /\bif\b/i,
  /\bunless\b/i,
  /\buntil\b/i,
  /\bwhether\b/i,
  /\bhopes?\b/i,
  /\bhoping\b/i,
  /\bshould\b/i,
  /未/,
  /没/,
  /无法/,
  /不/,
  /如果/,
  /除非/,
  /希望/,
];

function matches(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function splitSentences(text) {
  return String(text)
    .split(/\r?\n|(?<=[.!?。！？])\s*/u)
    .flatMap((part) => part.split(/\s*,?\s*\bbut\b\s*/i))
    .map((part) => part.trim())
    .filter(Boolean);
}

function withoutCountedFailure(sentence) {
  return sentence
    .replace(/\b(?:no|zero|0)\s+tests?\s+failed\b/gi, " ")
    .replace(/\b(?:no|zero|0)\s+failed\b/gi, " ")
    .replace(/测试没有失败/g, " ");
}

function sentenceClaimsPass(sentence) {
  const countedFailure =
    /\b(?:no|zero|0)\s+tests?\s+failed\b/i.test(sentence) || /测试没有失败/.test(sentence);
  const rest = withoutCountedFailure(sentence);
  if (matches(DISQUALIFY, rest)) return false;
  if (countedFailure) return true;
  return matches(PASS_WORD, sentence) && matches(TEST_WORD, sentence);
}

function claimsTestsPassed(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  return splitSentences(text).some(sentenceClaimsPass);
}

module.exports = {
  claimsTestsPassed,
};
