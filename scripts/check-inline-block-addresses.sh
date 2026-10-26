#!/usr/bin/env bash
# Disposable LF Git exports: BASE_EXPORT FIXED_EXPORT OUTPUT_DIRECTORY.
set -euo pipefail
base="$(cd "$1" && pwd)"
fixed="$(cd "$2" && pwd)"
mkdir -p "$3"
out="$(cd "$3" && pwd)"
export CARGO_TARGET_DIR="$out/target" CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
cp "$fixed/crates/rito-core/src/runtime/tests.rs" "$base/crates/rito-core/src/runtime/tests.rs"
cp "$fixed/crates/rito-core/src/runtime/tests/inline_block_interaction_tests.rs" "$base/crates/rito-core/src/runtime/tests/inline_block_interaction_tests.rs"
cd "$base"
cargo +1.95.0 clean --workspace > "$out/baseline-clean.log" 2>&1
set +e
cargo +1.95.0 test --locked -p rito-core inline_block_interaction_tests > "$out/baseline-tests.log" 2>&1
status=$?
set -e
test "$status" = 101
grep -q '0 passed; 3 failed;' "$out/baseline-tests.log"
cd "$fixed"
cargo +1.95.0 clean --workspace > "$out/fixed-clean.log" 2>&1
{
  cargo +1.95.0 fmt --all -- --check
  cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
  cargo +1.95.0 test --locked --workspace
} > "$out/checks.log" 2>&1
