#!/usr/bin/env bash
# End-to-end demo on a tiny sample project.
# Shows a receipt being written, a fresh receipt allowing "tests pass",
# and a missing, stale, or failed receipt blocking that claim.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
NODE="${NODE:-node}"
CLI="$ROOT/bin/cli.js"
DEMO=$(mktemp -d "${TMPDIR:-/tmp}/test-receipt-demo.XXXXXX")

cleanup() {
  rm -rf "$DEMO"
}
trap cleanup EXIT

echo "== copy examples/mini to $DEMO =="
cp -a "$ROOT/examples/mini/." "$DEMO/"
git -C "$DEMO" init -b main
git -C "$DEMO" config user.email "demo@example.com"
git -C "$DEMO" config user.name "demo"
git -C "$DEMO" config commit.gpgsign false
git -C "$DEMO" add .
git -C "$DEMO" commit -m "mini fixture"

hook() {
  local message="$1"
  "$NODE" "$CLI" hook <<EOF
{"hook_event_name":"Stop","cwd":"$DEMO","stop_hook_active":false,"last_assistant_message":$(printf '%s' "$message" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(s)))')}
EOF
}

expect_block() {
  local out
  out=$(hook "$1")
  printf '%s\n' "$out"
  case "$out" in
    *'"decision":"block"'*) ;;
    *) echo "expected a block for: $1" >&2; exit 1 ;;
  esac
}

expect_allow() {
  local out
  out=$(hook "$1")
  printf '%s\n' "$out"
  case "$out" in
    *'"decision":"block"'*) echo "expected allow for: $1" >&2; exit 1 ;;
  esac
}

check_out() {
  set +e
  CHECK_BODY=$("$NODE" "$CLI" check --cwd "$DEMO")
  CHECK_EXIT=$?
  set -e
  printf '%s\n' "$CHECK_BODY"
  echo "check exit=$CHECK_EXIT"
}

echo
echo "== 1. missing receipt: check fails, English and Chinese claims are blocked =="
check_out
test "$CHECK_EXIT" -eq 1
case "$CHECK_BODY" in
  *no-receipt*) ;;
  *) echo "expected no-receipt" >&2; exit 1 ;;
esac
echo "-- hook: All tests pass. --"
expect_block "All tests pass."
echo "-- hook: 测试通过。 --"
expect_block "测试通过。"

echo
echo "== 2. run the real npm test and write a receipt =="
"$NODE" "$CLI" run --cwd "$DEMO"
echo "-- receipt --"
cat "$DEMO/.test-receipt/latest.json"
echo "-- check (expect fresh: yes) --"
check_out
test "$CHECK_EXIT" -eq 0
case "$CHECK_BODY" in
  *"fresh: yes"*) ;;
  *) echo "expected fresh: yes" >&2; exit 1 ;;
esac
echo "-- hook allows the claim --"
expect_allow "All tests pass."

echo
echo "== 3. stale: edit the tree after the receipt =="
printf '\n// edited after the test run\n' >> "$DEMO/check.js"
check_out
test "$CHECK_EXIT" -eq 1
case "$CHECK_BODY" in
  *dirty-mismatch*) ;;
  *) echo "expected dirty-mismatch" >&2; exit 1 ;;
esac
echo "-- hook blocks the stale claim --"
expect_block "All tests pass."

echo
echo "== 4. failed: make the test fail, run again, block a pass claim =="
"$NODE" -e '
const fs = require("fs");
const p = process.argv[1];
fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("1 + 1, 2", "1 + 1, 3"));
' "$DEMO/check.js"
set +e
"$NODE" "$CLI" run --cwd "$DEMO"
RUN_EXIT=$?
set -e
echo "run exit=$RUN_EXIT"
test "$RUN_EXIT" -ne 0
check_out
test "$CHECK_EXIT" -eq 1
case "$CHECK_BODY" in
  *exit-nonzero*) ;;
  *) echo "expected exit-nonzero" >&2; exit 1 ;;
esac
echo "-- hook blocks \"All tests pass.\" --"
expect_block "All tests pass."
echo "-- hook allows an honest failure sentence --"
expect_allow "Tests failed with exit code 1."

echo
echo "== demo finished =="
