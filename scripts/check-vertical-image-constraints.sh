#!/usr/bin/env bash
# LF Git exports only: BASE FIXED PAINT_ONLY OUTPUT. All directories disposable.
set -euo pipefail
base="$(cd "$1" && pwd)"
fixed="$(cd "$2" && pwd)"
paint="$(cd "$3" && pwd)"
mkdir -p "$4"
out="$(cd "$4" && pwd)"
scripts="$(cd "$(dirname "$0")" && pwd)"
export CARGO_TARGET_DIR="$out/target"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"

cp "$fixed/crates/rito-inline/src/tests/mod.rs" "$base/crates/rito-inline/src/tests/mod.rs"
cp "$fixed/crates/rito-inline/src/tests/vertical_images.rs" "$base/crates/rito-inline/src/tests/vertical_images.rs"
cd "$base"
cargo +1.95.0 clean --workspace > "$out/baseline-clean.log" 2>&1
set +e
cargo +1.95.0 test --locked -p rito-inline tests::vertical_images:: > "$out/baseline-regressions.log" 2>&1
status=$?
set -e
test "$status" = 101
grep -q '0 passed; 3 failed;' "$out/baseline-regressions.log"

cd "$fixed"
cargo +1.95.0 clean --workspace > "$out/fixed-clean.log" 2>&1
{
  cargo +1.95.0 fmt --all -- --check
  cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
  cargo +1.95.0 test --locked --workspace
} > "$out/checks.log" 2>&1

# Only the probe needs the separate paint fix to expose boxed images.
# The standalone size fix above is tested without that production overlay.
cp "$paint/crates/rito-core/src/fragment_paint/vertical.rs" crates/rito-core/src/fragment_paint/vertical.rs
cp "$scripts/vertical-interaction-native.rs" crates/rito-core/examples/vertical_interaction_native.rs
cargo +1.95.0 clean --workspace > "$out/composition-clean.log" 2>&1
cargo +1.95.0 build --locked -p rito-core --example vertical_interaction_native > "$out/composition-build.log" 2>&1
cp "$CARGO_TARGET_DIR/debug/examples/vertical_interaction_native" "$out/fixed-probe"
sha256sum "$out/fixed-probe"
