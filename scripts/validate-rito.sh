#!/usr/bin/env bash
set -euo pipefail
cd "$1"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
# Do not reuse another checkout's workspace test binaries. Dependencies
# outside this workspace can remain cached.
cargo +1.95.0 clean --workspace
cargo +1.95.0 fmt --all -- --check
cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
cargo +1.95.0 test --locked --workspace
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
