#!/usr/bin/env bash
set -euo pipefail
cd "$1"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/home/helian/.cache/lunar-rito-target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
cargo +1.95.0 fmt --all -- --check
cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
cargo +1.95.0 test --locked --workspace
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
