#!/usr/bin/env bash
set -euo pipefail
# Arguments: baseline Git export, fixed Git export, isolated output directory.
baseline="$1"
fixed="$2"
out="$3"
scripts="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/home/helian/.cache/lunar-rito-target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
cd "$fixed"
# Git archives preserve commit timestamps. A shared Cargo target can otherwise
# reuse a newer artifact from the other export; force this package to rebuild.
cargo +1.95.0 clean -p rito-core
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
cp "$CARGO_TARGET_DIR/debug/examples/chapter-fragment-probe" "$out/fixed-probe"
python3 "$scripts/probe-alternate.py" --probe "$out/fixed-probe" --source "$fixed" \
  --label alternate-fixed-native --commit 61aeef9ca1ef3e41340eae0b1cf5cb27500bb160
cd "$baseline"
cargo +1.95.0 clean -p rito-core
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
cp "$CARGO_TARGET_DIR/debug/examples/chapter-fragment-probe" "$out/baseline-probe"
python3 "$scripts/probe-alternate.py" --probe "$out/baseline-probe" --source "$baseline" \
  --label alternate-baseline-native --commit ed0284f3703244da28b3e6efd80cf29267cf6e65
python3 "$scripts/compare-alternate.py"
