#!/usr/bin/env bash
set -euo pipefail
# Three exact, LF Git exports: ed0284f, 376e939, 5fa3f60; then output directory.
sources=("$1" "$2" "$3")
labels=(baseline search vertical)
mkdir -p "$4"
out="$(cd "$4" && pwd)"
scripts="$(cd "$(dirname "$0")" && pwd)"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$out/target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
for index in 0 1 2; do
  cd "${sources[$index]}"
  label="${labels[$index]}"
  cp "$scripts/search-wrap-native.rs" crates/rito-core/examples/search_wrap_native.rs
  cp "$scripts/vertical-interaction-native.rs" crates/rito-core/examples/vertical_interaction_native.rs
  cargo +1.95.0 clean --workspace
  {
    cargo +1.95.0 fmt --all -- --check
    cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
    cargo +1.95.0 test --locked --workspace
    cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe \
      --example search_wrap_native --example vertical_interaction_native
  } > "$out/$label-checks.log" 2>&1
  cp "$CARGO_TARGET_DIR/debug/examples/chapter-fragment-probe" "$out/$label-chapter"
  cp "$CARGO_TARGET_DIR/debug/examples/search_wrap_native" "$out/$label-search"
  cp "$CARGO_TARGET_DIR/debug/examples/vertical_interaction_native" "$out/$label-vertical"
  printf '%s complete\n' "$label"
done
