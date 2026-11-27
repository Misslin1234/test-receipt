"use strict";

// Keyword check only. It is intentionally narrow: a paraphrase can slip
// through, and a quoted example can be flagged. The skill is the rule.
const CLAIM_PATTERNS = [
  /\b(?:all\s+|the\s+)?(?:\d+\s+)?(?:unit\s+|integration\s+|e2e\s+)?tests?\s+(?:now\s+|all\s+|have\s+|has\s+|just\s+)?(?:pass(?:ed|ing)?|succeed(?:ed)?)\b/i,
  /\btests?\s+are\s+(?:now\s+)?(?:passing|green|successful)\b/i,
  /\btest suite\s+(?:has\s+|is\s+)?(?:pass(?:ed|ing)?|green|succeed(?:ed)?)\b/i,
  /\b(?:npm|pnpm|yarn|cargo|make)\s+test\s+(?:pass(?:ed|ing)?|succeed(?:ed)?)\b/i,
  /\bgo\s+test(?:\s+\.\/\.\.\.)?\s+(?:pass(?:ed|ing)?|succeed(?:ed)?)\b/i,
  /\bpytest\s+(?:pass(?:ed|ing)?|succeed(?:ed)?)\b/i,
  /\b(?:ran|run|executed)\s+(?:the\s+)?(?:unit\s+|integration\s+)?tests?\b[^.!?\n。！？]{0,80}\bpass(?:ed|ing)?\b/i,
  /\b(?:no|zero|0)\s+tests?\s+failed\b/i,
  /测试(?:都|已|全部|均|全都|全)?通过/,
  /(?:全部|所有|全都)测试(?:都|已|均)?通过/,
  /单元测试(?:都|已|全部|均)?通过/,
  /单测(?:都|已)?通过/,
  /测试成功了?/,
  /已通过(?:全部|所有)?测试/,
  /测试都过了/,
  /测试没有失败/,
];

const DISQUALIFY_PATTERNS = [
  /\btests?\s+(?:do not|don't|did not|didn't|never|cannot|can't|won't|will not|have not|haven't|were not|was not|are not|aren't|is not|isn't)\b/i,
  /\b(?:did not|didn't|do not|don't|have not|haven't|has not|hasn't|never|without)\s+(?:actually\s+)?run\b/i,
  /\bnot\s+run\b/i,
  /\bwere not tested\b/i,
  /\bwas not tested\b/i,
  /\btests?\s+fail(?:ed|ing|ure)?\b/i,
  /\bfailing tests?\b/i,
  /\b(?:if|unless|until|whether|hope|hoping)\b/i,
  /\b(?:make sure|ensure|so that)\b/i,
  /\b(?:do not|don't|never)\s+(?:say|claim|tell|write)\b/i,
  /测试(?:并)?(?:没有|未|不|没)(?:通过|运行|跑)/,
  /(?:没有|未|没|别)(?:去)?(?:运行|跑)(?:过)?测试/,
  /测试失败/,
  /测试没过/,
  /如果/,
  /除非/,
  /希望测试/,
];

function splitSentences(text) {
  return String(text)
    .split(/\r?\n|(?<=[.!?。！？])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sentenceClaimsPass(sentence) {
  // "no tests failed" is a pass claim, but it also contains "tests failed".
  // Strip that phrase before applying the failure disqualifiers.
  const stripped = sentence.replace(/\b(?:no|zero|0)\s+tests?\s+failed\b/gi, " ");
  if (DISQUALIFY_PATTERNS.some((pattern) => pattern.test(stripped))) return false;
  return CLAIM_PATTERNS.some((pattern) => pattern.test(sentence));
}

function claimsTestsPassed(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  return splitSentences(text).some(sentenceClaimsPass);
}

module.exports = {
  claimsTestsPassed,
  CLAIM_PATTERNS,
  DISQUALIFY_PATTERNS,
};
