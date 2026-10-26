#!/usr/bin/env bash
# Disposable LF Git exports only: BASE_EXPORT FIXED_EXPORT OUTPUT_DIRECTORY.
set -euo pipefail
base="$(cd "$1" && pwd)"
fixed="$(cd "$2" && pwd)"
mkdir -p "$3"
out="$(cd "$3" && pwd)"
scripts="$(cd "$(dirname "$0")" && pwd)"
export CARGO_TARGET_DIR="$out/target"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"

# The only baseline overlays are the new test module and its declaration.
cp "$fixed/crates/rito-core/src/runtime/tests.rs" "$base/crates/rito-core/src/runtime/tests.rs"
cp "$fixed/crates/rito-core/src/runtime/tests/vertical_inline_block_tests.rs" \
  "$base/crates/rito-core/src/runtime/tests/vertical_inline_block_tests.rs"
cd "$base"
cp "$scripts/vertical-interaction-native.rs" crates/rito-core/examples/vertical_interaction_native.rs
cargo +1.95.0 clean --workspace > "$out/baseline-clean.log" 2>&1
set +e
cargo +1.95.0 test --locked -p rito-core runtime::tests::vertical_inline_block_tests:: \
  > "$out/baseline-regressions.log" 2>&1
status=$?
set -e
test "$status" = 101
grep -q 'test result: FAILED. 0 passed; 4 failed;' "$out/baseline-regressions.log"
cargo +1.95.0 build --locked -p rito-core --example vertical_interaction_native \
  > "$out/baseline-probe-build.log" 2>&1
cp "$CARGO_TARGET_DIR/debug/examples/vertical_interaction_native" "$out/base-probe"

cd "$fixed"
cp "$scripts/vertical-interaction-native.rs" crates/rito-core/examples/vertical_interaction_native.rs
cargo +1.95.0 clean --workspace > "$out/fixed-clean.log" 2>&1
{
  cargo +1.95.0 fmt --all -- --check
  cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
  cargo +1.95.0 test --locked --workspace
  cargo +1.95.0 build --locked -p rito-core --example vertical_interaction_native
} > "$out/checks.log" 2>&1
cp "$CARGO_TARGET_DIR/debug/examples/vertical_interaction_native" "$out/fixed-probe"
sha256sum "$out/fixed-probe"
