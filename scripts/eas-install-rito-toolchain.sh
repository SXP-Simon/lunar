#!/usr/bin/env bash
set -euo pipefail

if [ "${EAS_BUILD_PLATFORM:-}" != "android" ]; then
  exit 0
fi

if command -v rustc >/dev/null 2>&1 && rustc --version | grep -q '1.95.0'; then
  echo "Rust 1.95.0 is already available."
else
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.95.0
fi

. "$HOME/.cargo/env"
rustup target add aarch64-linux-android

if ! command -v cargo-ndk >/dev/null 2>&1; then
  cargo install cargo-ndk --version 4.1.2 --locked
fi

set-env PATH "$HOME/.cargo/bin:$PATH"
