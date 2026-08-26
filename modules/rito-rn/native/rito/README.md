# Vendored Rito Rust workspace

This directory contains the minimal Rito 1.0.0 Rust workspace needed by
`rito-ffi`. It is kept with `@ritojs/react-native` so Android and iOS builds
have the same source tree after the package is installed.

The snapshot comes from Rito commit
`3c938c0b70580da484cadfbfa86dd598fb5eec49`. From the Lunar repository, run
`pnpm run sync:rito-native` after updating the local `lib/Rito` checkout.

The `target` directory is machine-local build output and is excluded from
source packages. The Android build task reuses an existing
`target/aarch64-linux-android/release/librito_ffi.a` when available.
